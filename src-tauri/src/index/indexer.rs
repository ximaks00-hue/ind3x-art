use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;

use crate::dto::{AssetEntry, IndexEvent};
use crate::error::{CoreError, CoreResult};
use crate::index::classify::classify_path;
use crate::source::AssetSource;

const CACHE_PREFIX: &str = "index:v1:";
const CONTENT_SAMPLE_FILES: usize = 32;
const CONTENT_SAMPLE_BYTES: usize = 4096;

pub fn cache_key_for(fingerprint: &str) -> String {
    format!("{CACHE_PREFIX}{fingerprint}")
}

pub fn invalidate_index(db: &sled::Db, fingerprint: &str) -> CoreResult<()> {
    db.remove(cache_key_for(fingerprint).as_bytes())?;
    Ok(())
}

pub fn run_index(
    source: &dyn AssetSource,
    db: &sled::Db,
    fingerprint: &str,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<IndexEvent>,
) -> CoreResult<(Vec<AssetEntry>, bool)> {
    let started = Instant::now();
    let cache_key = cache_key_for(fingerprint);

    if let Some(cached) = db.get(cache_key.as_bytes())? {
        let entries: Vec<AssetEntry> = serde_json::from_slice(&cached)
            .map_err(|e| CoreError::Internal(format!("cache decode failed: {e}")))?;
        let total = entries.len() as u64;

        send(on_event, IndexEvent::Started { total })?;

        for (i, entry) in entries.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err(CoreError::Cancelled);
            }
            send(on_event, IndexEvent::Asset { entry: entry.clone() })?;
            if i % 250 == 0 {
                send(
                    on_event,
                    IndexEvent::Progress {
                        scanned: i as u64,
                        total,
                        stage: "from cache".to_string(),
                    },
                )?;
            }
        }

        send(
            on_event,
            IndexEvent::Progress {
                scanned: total,
                total,
                stage: "loaded from cache".to_string(),
            },
        )?;
        send(
            on_event,
            IndexEvent::Done {
                duration_ms: started.elapsed().as_millis() as u64,
                from_cache: true,
            },
        )?;
        return Ok((entries, true));
    }

    let paths = source.list_entries()?;
    let total = paths.len() as u64;
    send(on_event, IndexEvent::Started { total })?;

    let mut entries: Vec<AssetEntry> = paths
        .par_iter()
        .filter_map(|path| {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }
            classify_path(path)
        })
        .collect();

    if cancel.load(Ordering::Relaxed) {
        return Err(CoreError::Cancelled);
    }

    entries.par_sort_unstable_by(|a, b| a.path.cmp(&b.path));
    entries.dedup_by(|a, b| a.path == b.path);

    let classified_set: HashSet<String> = entries.iter().map(|e| e.path.clone()).collect();
    for path in &paths {
        if path.starts_with("assets/") && !classified_set.contains(path) {
            let reason = if path.ends_with(".json") {
                "unrecognized JSON under assets/".to_string()
            } else if path.ends_with(".png") {
                "texture path not under textures/".to_string()
            } else {
                "unrecognized asset path".to_string()
            };
            let _ = send(
                on_event,
                IndexEvent::Warning {
                    path: path.clone(),
                    reason,
                },
            );
        }
    }

    let classified = entries.len() as u64;

    for (i, entry) in entries.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(CoreError::Cancelled);
        }
        send(on_event, IndexEvent::Asset { entry: entry.clone() })?;
        if i % 250 == 0 {
            send(
                on_event,
                IndexEvent::Progress {
                    scanned: i as u64,
                    total: classified,
                    stage: "indexing".to_string(),
                },
            )?;
        }
    }

    send(
        on_event,
        IndexEvent::Progress {
            scanned: classified,
            total: classified,
            stage: format!("classified {classified} assets"),
        },
    )?;

    let encoded = serde_json::to_vec(&entries)
        .map_err(|e| CoreError::Internal(format!("cache encode failed: {e}")))?;
    db.insert(cache_key.as_bytes(), encoded)?;

    send(
        on_event,
        IndexEvent::Done {
            duration_ms: started.elapsed().as_millis() as u64,
            from_cache: false,
        },
    )?;

    Ok((entries, false))
}

/// Patch index entries for specific changed paths (partial reindex).
pub fn patch_entries_for_paths(
    entries: &mut Vec<AssetEntry>,
    source: &dyn AssetSource,
    changed_paths: &[String],
    on_event: Option<&Channel<IndexEvent>>,
) -> CoreResult<()> {
    for raw_path in changed_paths {
        let path = raw_path.replace('\\', "/");
        entries.retain(|e| e.path != path);

        if source.read(&path).is_err() {
            if let Some(ch) = on_event {
                let _ = send(
                    ch,
                    IndexEvent::Warning {
                        path: path.clone(),
                        reason: "removed from source".to_string(),
                    },
                );
            }
            continue;
        }

        if let Some(entry) = classify_path(&path) {
            if let Some(ch) = on_event {
                send(ch, IndexEvent::Asset { entry: entry.clone() })?;
            }
            entries.push(entry);
        } else if path.starts_with("assets/") {
            if let Some(ch) = on_event {
                let _ = send(
                    ch,
                    IndexEvent::Warning {
                        path: path.clone(),
                        reason: "could not classify changed path".to_string(),
                    },
                );
            }
        }
    }

    entries.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    entries.dedup_by(|a, b| a.path == b.path);
    Ok(())
}

pub fn source_fingerprint(path: &Path) -> CoreResult<String> {
    let meta = std::fs::metadata(path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let canonical = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string();
    let sample = content_sample_digest(path)?;
    let payload = format!("{}:{}:{}:{}", canonical, meta.len(), modified, sample);
    let digest = Sha256::digest(payload.as_bytes());
    Ok(hex::encode(digest))
}

fn content_sample_digest(path: &Path) -> CoreResult<String> {
    if path.is_file() {
        return sample_file_digest(path, CONTENT_SAMPLE_BYTES * 4);
    }

    if !path.is_dir() {
        return Ok(String::new());
    }

    let mut files: Vec<String> = Vec::new();
    collect_sample_paths(path, path, &mut files, CONTENT_SAMPLE_FILES * 4)?;
    files.sort();
    files.truncate(CONTENT_SAMPLE_FILES);

    let mut hasher = Sha256::new();
    for rel in files {
        hasher.update(rel.as_bytes());
        let abs = path.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Ok(meta) = std::fs::metadata(&abs) {
            hasher.update(meta.len().to_le_bytes());
        }
        if let Ok(digest) = sample_file_digest(&abs, CONTENT_SAMPLE_BYTES) {
            hasher.update(digest.as_bytes());
        }
    }
    Ok(hex::encode(hasher.finalize()))
}

fn collect_sample_paths(
    root: &Path,
    dir: &Path,
    out: &mut Vec<String>,
    limit: usize,
) -> CoreResult<()> {
    if out.len() >= limit {
        return Ok(());
    }
    let read_dir = match std::fs::read_dir(dir) {
        Ok(d) => d,
        Err(_) => return Ok(()),
    };
    for entry in read_dir.flatten() {
        if out.len() >= limit {
            break;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_sample_paths(root, &path, out, limit)?;
        } else if path.is_file() {
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            if rel.starts_with("assets/") {
                out.push(rel);
            }
        }
    }
    Ok(())
}

fn sample_file_digest(path: &Path, max_bytes: usize) -> CoreResult<String> {
    let mut file = File::open(path)?;
    let mut buf = vec![0u8; max_bytes.min(64 * 1024)];
    let read = file.read(&mut buf)?;
    buf.truncate(read);
    Ok(hex::encode(Sha256::digest(&buf)))
}

fn send(on_event: &Channel<IndexEvent>, event: IndexEvent) -> CoreResult<()> {
    on_event
        .send(event)
        .map_err(|e| CoreError::Internal(e.to_string()))
}
