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

pub fn run_index(
    source: &dyn AssetSource,
    db: &sled::Db,
    fingerprint: &str,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<IndexEvent>,
) -> CoreResult<(Vec<AssetEntry>, bool)> {
    let started = Instant::now();
    let cache_key = format!("{CACHE_PREFIX}{fingerprint}");

    if let Some(cached) = db.get(cache_key.as_bytes())? {
        let entries: Vec<AssetEntry> = serde_json::from_slice(&cached)
            .map_err(|e| CoreError::Internal(format!("cache decode failed: {e}")))?;
        let total = entries.len() as u64;

        send(on_event, IndexEvent::Started { total })?;

        // Stream cached entries so the frontend can populate the tree progressively,
        // same as the cold-index path.
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

    // Classify in parallel, then stream each entry to the frontend
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

    let classified = entries.len() as u64;

    // Stream individual asset events so the frontend can populate the tree progressively.
    // Send a progress ping every 250 entries to keep the channel from flooding.
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
    let payload = format!("{}:{}:{}", canonical, meta.len(), modified);
    let digest = Sha256::digest(payload.as_bytes());
    Ok(hex::encode(digest))
}

fn send(on_event: &Channel<IndexEvent>, event: IndexEvent) -> CoreResult<()> {
    on_event
        .send(event)
        .map_err(|e| CoreError::Internal(e.to_string()))
}
