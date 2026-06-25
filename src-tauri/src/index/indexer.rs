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
use tauri::Emitter;

use crate::dto::{AssetEntry, AssetKind, IndexEvent, SourceKind};
use crate::error::{log_if_err, CoreError, CoreResult};
use crate::index::classify::classify_path;
use crate::source::{AssetSource, JarSource};

const CACHE_PREFIX: &str = "index:v1:";
const CONTENT_SAMPLE_FILES: usize = 32;
const CONTENT_SAMPLE_BYTES: usize = 4096;

pub fn cache_key_for(fingerprint: &str) -> String {
    format!("{CACHE_PREFIX}{fingerprint}")
}

fn remove_index_cache_key(db: &sled::Db, key: &str) {
    log_if_err(
        db.remove(key.as_bytes()).map_err(CoreError::from),
        "remove stale index cache entry",
    );
}

pub fn invalidate_index(db: &sled::Db, fingerprint: &str) -> CoreResult<()> {
    db.remove(cache_key_for(fingerprint).as_bytes())?;
    Ok(())
}

fn source_trust_counts(source: &dyn AssetSource) -> CoreResult<(usize, usize)> {
    if source.source_kind() == SourceKind::Jar {
        let jar = JarSource::new(source.source_path())?;
        return jar.count_blockstate_and_lang_paths();
    }
    let entries = source.list_entries()?;
    let blockstates = entries
        .iter()
        .filter(|p| p.contains("/blockstates/") && p.ends_with(".json"))
        .count();
    let langs = entries
        .iter()
        .filter(|p| p.starts_with("assets/") && p.contains("/lang/") && p.ends_with(".json"))
        .count();
    Ok((blockstates, langs))
}

fn indexed_lang_count(entries: &[AssetEntry]) -> usize {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::Lang)
        .count()
}

fn send_index_progress(
    on_event: &Channel<IndexEvent>,
    app_emit: Option<&tauri::AppHandle>,
    scanned: u64,
    total: u64,
    stage: &str,
) -> CoreResult<()> {
    send(
        on_event,
        app_emit,
        IndexEvent::Progress {
            scanned,
            total: total.max(1),
            stage: stage.to_string(),
        },
    )
}

fn indexed_blockstate_count(entries: &[AssetEntry]) -> usize {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::Blockstate)
        .count()
}

/// Reject index caches that lost blockstates (common corruption after bad incremental patches).
pub fn cached_index_trustworthy(
    source: &dyn AssetSource,
    entries: &[AssetEntry],
) -> CoreResult<bool> {
    let (live_bs, live_lang) = source_trust_counts(source)?;
    let cached_bs = indexed_blockstate_count(entries);
    if live_bs > 0 && cached_bs == 0 {
        tracing::warn!(
            live_blockstates = live_bs,
            "rejecting index cache: source has blockstates but cached index has none"
        );
        return Ok(false);
    }
    let cached_lang = indexed_lang_count(entries);
    if live_lang > 0 && cached_lang == 0 {
        tracing::warn!(
            live_lang_files = live_lang,
            "rejecting index cache: source has lang files but cached index has none"
        );
        return Ok(false);
    }
    Ok(true)
}

pub fn run_index(
    source: &dyn AssetSource,
    db: &sled::Db,
    fingerprint: &str,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<IndexEvent>,
    app_emit: Option<&tauri::AppHandle>,
    force_refresh: bool,
) -> CoreResult<(Vec<AssetEntry>, bool)> {
    let started = Instant::now();
    let cache_key = cache_key_for(fingerprint);

    if !force_refresh {
        if let Some(cached) = db.get(cache_key.as_bytes())? {
            let entries: Vec<AssetEntry> = match serde_json::from_slice(&cached) {
                Ok(entries) => entries,
                Err(e) => {
                    tracing::warn!("index cache decode failed, rescanning: {e}");
                    remove_index_cache_key(db, &cache_key);
                    Vec::new()
                }
            };
            if !entries.is_empty() {
                let trustworthy = match cached_index_trustworthy(source, &entries) {
                    Ok(trustworthy) => trustworthy,
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            "index cache trust check failed — rescanning"
                        );
                        false
                    }
                };
                if !trustworthy {
                    remove_index_cache_key(db, &cache_key);
                } else {
                    let total = entries.len() as u64;

                    send(on_event, app_emit, IndexEvent::Started { total })?;
                    send_index_progress(on_event, app_emit, total, total, "from cache")?;
                    send(
                        on_event,
                        app_emit,
                        IndexEvent::Done {
                            duration_ms: started.elapsed().as_millis() as u64,
                            from_cache: true,
                        },
                    )?;
                    return Ok((entries, true));
                }
            }
            remove_index_cache_key(db, &cache_key);
        }
    } else {
        remove_index_cache_key(db, &cache_key);
    }

    let entries = collect_indexed_entries(source, cancel, on_event, app_emit)?;

    let encoded = serde_json::to_vec(&entries)
        .map_err(|e| CoreError::Internal(format!("cache encode failed: {e}")))?;
    if !entries.is_empty() {
        db.insert(cache_key.as_bytes(), encoded)?;
    } else {
        remove_index_cache_key(db, &cache_key);
    }

    send(
        on_event,
        app_emit,
        IndexEvent::Done {
            duration_ms: started.elapsed().as_millis() as u64,
            from_cache: false,
        },
    )?;

    Ok((entries, false))
}

/// Cold-scan all source paths into classified index entries (no sled cache).
pub fn collect_indexed_entries(
    source: &dyn AssetSource,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<IndexEvent>,
    app_emit: Option<&tauri::AppHandle>,
) -> CoreResult<Vec<AssetEntry>> {
    let paths = source.list_entries()?;
    let total = paths.len() as u64;
    send(on_event, app_emit, IndexEvent::Started { total })?;

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
    const MAX_WARNING_SAMPLES: usize = 8;
    let mut unclassified_count = 0u64;
    let mut samples: Vec<String> = Vec::new();
    for path in &paths {
        if path.starts_with("assets/") && !classified_set.contains(path) {
            unclassified_count += 1;
            if samples.len() < MAX_WARNING_SAMPLES {
                samples.push(path.clone());
            }
        }
    }
    if unclassified_count > 0 {
        let reason = format!(
            "{unclassified_count} unrecognized asset paths (showing {}): {}",
            samples.len(),
            samples.join(", ")
        );
        let _ = send(
            on_event,
            None,
            IndexEvent::Warning {
                path: samples
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "assets/".to_string()),
                reason,
            },
        );
    }

    let classified = entries.len() as u64;
    send_index_progress(on_event, app_emit, 0, classified.max(1), "classifying")?;
    send_index_progress(on_event, app_emit, classified, classified.max(1), "indexed")?;

    Ok(entries)
}

/// Synchronous full scan — no progress events (restore / rollback paths).
pub fn scan_index_entries(source: &dyn AssetSource) -> CoreResult<Vec<AssetEntry>> {
    let paths = source.list_entries()?;
    let mut entries: Vec<AssetEntry> = paths
        .par_iter()
        .filter_map(|path| classify_path(path))
        .collect();
    entries.par_sort_unstable_by(|a, b| a.path.cmp(&b.path));
    entries.dedup_by(|a, b| a.path == b.path);
    Ok(entries)
}

fn read_failure_is_missing(err: &CoreError) -> bool {
    match err {
        CoreError::AssetNotFound(_) => true,
        CoreError::Io(e) => e.kind() == std::io::ErrorKind::NotFound,
        _ => false,
    }
}

/// Drop index rows whose paths no longer exist in the source listing.
pub fn prune_orphan_entries(
    entries: &mut Vec<AssetEntry>,
    source: &dyn AssetSource,
) -> CoreResult<()> {
    let live: HashSet<String> = source.list_entries()?.into_iter().collect();
    entries.retain(|e| live.contains(&e.path));
    Ok(())
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

        if let Err(err) = source.read(&path) {
            if read_failure_is_missing(&err) {
                let had_entry = entries.iter().any(|e| e.path == path);
                entries.retain(|e| e.path != path);
                if had_entry {
                    if let Some(ch) = on_event {
                        let _ = send(
                            ch,
                            None,
                            IndexEvent::Warning {
                                path: path.clone(),
                                reason: "removed from source".to_string(),
                            },
                        );
                    }
                }
            } else if let Some(ch) = on_event {
                let _ = send(
                    ch,
                    None,
                    IndexEvent::Warning {
                        path: path.clone(),
                        reason: format!("read failed, keeping index entry: {err}"),
                    },
                );
            }
            continue;
        }

        if let Some(entry) = classify_path(&path) {
            if let Some(ch) = on_event {
                send(ch, None, IndexEvent::Asset { entry: entry.clone() })?;
            }
            entries.retain(|e| e.path != path);
            entries.push(entry);
        } else {
            let had_entry = entries.iter().any(|e| e.path == path);
            entries.retain(|e| e.path != path);
            if had_entry || path.starts_with("assets/") {
                if let Some(ch) = on_event {
                    let _ = send(
                        ch,
                        None,
                        IndexEvent::Warning {
                            path: path.clone(),
                            reason: "could not classify changed path".to_string(),
                        },
                    );
                }
            }
        }
    }

    entries.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    entries.dedup_by(|a, b| a.path == b.path);
    Ok(())
}

/// Bump fingerprint after point saves without scanning the whole pack tree.
pub fn incremental_fingerprint_for_paths(
    previous_fingerprint: &str,
    root: &Path,
    changed_paths: &[String],
) -> CoreResult<String> {
    let mut hasher = Sha256::new();
    hasher.update(b"inc:v1:");
    hasher.update(previous_fingerprint.as_bytes());
    if let Ok(meta) = std::fs::metadata(root) {
        hasher.update(meta.len().to_le_bytes());
        if let Ok(secs) = meta.modified().and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidData))
        }) {
            hasher.update(secs.as_secs().to_le_bytes());
        }
    }

    let mut paths: Vec<String> = changed_paths
        .iter()
        .map(|path| crate::source::normalize_zip_path(path))
        .collect();
    paths.sort();
    paths.dedup();

    for rel in paths {
        hasher.update(rel.as_bytes());
        let abs = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let Ok(meta) = std::fs::metadata(&abs) else {
            continue;
        };
        hasher.update(meta.len().to_le_bytes());
        if let Ok(secs) = meta.modified().and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidData))
        }) {
            hasher.update(secs.as_secs().to_le_bytes());
        }
        if meta.is_file() {
            if let Ok(digest) = sample_file_digest(&abs, CONTENT_SAMPLE_BYTES) {
                hasher.update(digest.as_bytes());
            }
        }
    }

    Ok(hex::encode(hasher.finalize()))
}

/// Choose incremental vs full fingerprint depending on source kind and change scope.
pub fn fingerprint_after_disk_change(
    source_path: &Path,
    source_kind: SourceKind,
    previous_fingerprint: &str,
    changed_paths: &[String],
) -> CoreResult<String> {
    match source_kind {
        SourceKind::Folder if !changed_paths.is_empty() => incremental_fingerprint_for_paths(
            previous_fingerprint,
            source_path,
            changed_paths,
        ),
        _ => source_fingerprint(source_path),
    }
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
    let listing = folder_index_summary_digest(path)?;
    let payload = format!(
        "{}:{}:{}:{}:{}",
        canonical, meta.len(), modified, sample, listing
    );
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

fn folder_index_summary_digest(path: &Path) -> CoreResult<String> {
    if !path.is_dir() {
        return Ok(String::new());
    }
    let source = crate::source::FolderSource::new(path)?;
    let paths = source.list_entries()?;
    let mut hasher = Sha256::new();
    hasher.update((paths.len() as u64).to_le_bytes());

    if paths.is_empty() {
        return Ok(hex::encode(hasher.finalize()));
    }

    let stride = (paths.len() / CONTENT_SAMPLE_FILES).max(1);
    for (i, rel) in paths.iter().enumerate() {
        if i % stride == 0 || i < 8 || i + 8 >= paths.len() {
            hasher.update(rel.as_bytes());
            let abs = path.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Ok(meta) = std::fs::metadata(&abs) {
                hasher.update(meta.len().to_le_bytes());
                if let Ok(secs) = meta.modified().and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidData))
                }) {
                    hasher.update(secs.as_secs().to_le_bytes());
                }
            }
        }
    }
    Ok(hex::encode(hasher.finalize()))
}

#[allow(dead_code)]
fn folder_asset_listing_digest(path: &Path) -> CoreResult<String> {
    if !path.is_dir() {
        return Ok(String::new());
    }
    let source = crate::source::FolderSource::new(path)?;
    let paths = source.list_entries()?;
    let mut hasher = Sha256::new();
    hasher.update((paths.len() as u64).to_le_bytes());
    for rel in paths {
        hasher.update(rel.as_bytes());
        let abs = path.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Ok(meta) = std::fs::metadata(&abs) {
            hasher.update(meta.len().to_le_bytes());
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

fn send(
    on_event: &Channel<IndexEvent>,
    app_emit: Option<&tauri::AppHandle>,
    event: IndexEvent,
) -> CoreResult<()> {
    if let Some(app) = app_emit {
        let _ = app.emit("index-event", event.clone());
    }
    on_event
        .send(event)
        .map_err(|e| CoreError::Internal(e.to_string()))
}

#[cfg(test)]
mod fingerprint_tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn fingerprint_stable_for_unchanged_folder() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/simple_pack");
        let a = source_fingerprint(&root).expect("fp a");
        let b = source_fingerprint(&root).expect("fp b");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64, "sha256 hex digest");
    }

    #[test]
    fn fingerprint_changes_when_file_is_added() {
        let tmp = TempDir::new().expect("temp dir");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/lang_pack");
        copy_fixture_tree(&src, tmp.path());

        let before = source_fingerprint(tmp.path()).expect("before");
        std::fs::write(
            tmp.path().join("assets/minecraft/textures/block/new_block.png"),
            b"\x89PNG\r\n\x1a\n",
        )
        .expect("write new file");
        let after = source_fingerprint(tmp.path()).expect("after");
        assert_ne!(before, after);
    }

    #[test]
    fn fingerprint_changes_when_file_content_changes() {
        let tmp = TempDir::new().expect("temp dir");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/lang_pack");
        copy_fixture_tree(&src, tmp.path());

        let before = source_fingerprint(tmp.path()).expect("before");
        let texture = tmp
            .path()
            .join("assets/minecraft/textures/block/test_stone.png");
        let mut bytes = std::fs::read(&texture).expect("read texture");
        if let Some(last) = bytes.last_mut() {
            *last ^= 0xFF;
        }
        std::fs::write(&texture, &bytes).expect("mutate texture");
        let after = source_fingerprint(tmp.path()).expect("after");
        assert_ne!(before, after);
    }

    #[test]
    fn incremental_fingerprint_changes_after_save_without_full_scan() {
        let tmp = TempDir::new().expect("temp dir");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/lang_pack");
        copy_fixture_tree(&src, tmp.path());

        let before = source_fingerprint(tmp.path()).expect("before");
        let texture = "assets/minecraft/textures/block/test_stone.png";
        let texture_abs = tmp.path().join(texture);
        let mut bytes = std::fs::read(&texture_abs).expect("read texture");
        if let Some(last) = bytes.last_mut() {
            *last ^= 0xFF;
        }
        std::fs::write(&texture_abs, &bytes).expect("mutate texture");

        let incremental = incremental_fingerprint_for_paths(before.as_str(), tmp.path(), &[texture.to_string()])
            .expect("incremental");
        let full = source_fingerprint(tmp.path()).expect("full after");
        assert_ne!(before, incremental);
        assert_ne!(before, full);
        assert_eq!(incremental.len(), 64);
    }

    fn copy_fixture_tree(src: &std::path::Path, dst: &std::path::Path) {
        for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
            let rel = entry.path().strip_prefix(src).expect("strip");
            let dest = dst.join(rel);
            if entry.file_type().is_dir() {
                std::fs::create_dir_all(&dest).expect("mkdir");
            } else {
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).expect("mkdir parent");
                }
                std::fs::copy(entry.path(), &dest).expect("copy");
            }
        }
    }
}
