//! File-system watcher using the `notify` crate.
//! Watches a source path and emits Tauri events when it changes externally.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::dto::SourceKind;

pub const EVENT_SOURCE_CHANGED: &str = "source-changed";
pub const EVENT_CACHE_INVALIDATED: &str = "cache-invalidated";

#[derive(Debug, Clone, serde::Serialize)]
pub struct SourceChangedPayload {
    pub path: String,
    pub kind: String,
}

pub struct SourceWatcher {
    _watcher: RecommendedWatcher,
}

pub(crate) fn relative_pack_path(watch_root: &Path, changed: &Path) -> String {
    changed
        .strip_prefix(watch_root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| changed.to_string_lossy().replace('\\', "/"))
}

impl SourceWatcher {
    pub fn new(app: AppHandle, source_path: PathBuf) -> notify::Result<Self> {
        let app_clone = app.clone();
        let watch_root = if source_path.is_dir() {
            source_path.clone()
        } else {
            source_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| source_path.clone())
        };

        let watch_root_for_events = watch_root.clone();
        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    let kind_str = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Modify(_) => "modify",
                        EventKind::Remove(_) => "remove",
                        _ => return,
                    };
                    for path in event.paths {
                        let relative = relative_pack_path(&watch_root_for_events, &path);
                        if relative.starts_with(".ind3x-") {
                            continue;
                        }
                        let _ = app_clone.emit(
                            EVENT_SOURCE_CHANGED,
                            SourceChangedPayload {
                                path: relative,
                                kind: kind_str.to_string(),
                            },
                        );
                    }
                    let _ = app_clone.emit(EVENT_CACHE_INVALIDATED, ());
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        watcher.watch(&watch_root, RecursiveMode::Recursive)?;
        Ok(Self { _watcher: watcher })
    }
}

/// Active watchers keyed by project handle id.
pub type SharedWatcher = Arc<Mutex<HashMap<u64, SourceWatcher>>>;

pub(crate) fn should_watch_source(source_kind: SourceKind) -> bool {
    source_kind != SourceKind::Jar
}

pub fn install_watcher(
    app: AppHandle,
    handle_id: u64,
    source_path: PathBuf,
    source_kind: SourceKind,
    shared: &SharedWatcher,
) {
    if !should_watch_source(source_kind) {
        tracing::debug!(
            path = %source_path.display(),
            "skipping filesystem watcher for JAR source"
        );
        return;
    }

    match SourceWatcher::new(app, source_path) {
        Ok(w) => match shared.lock() {
            Ok(mut guard) => {
                guard.insert(handle_id, w);
            }
            Err(e) => {
                tracing::warn!("watcher mutex poisoned, skipping install: {e}");
            }
        },
        Err(e) => {
            tracing::warn!("file watcher failed to start: {e}");
        }
    }
}

pub fn stop_watcher(handle_id: u64, shared: &SharedWatcher) {
    match shared.lock() {
        Ok(mut guard) => {
            guard.remove(&handle_id);
        }
        Err(e) => {
            tracing::warn!("watcher mutex poisoned, skipping stop: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::dto::SourceKind;

    #[test]
    fn relative_pack_path_strips_watch_root() {
        let root = Path::new("/data/pack");
        let changed = Path::new("/data/pack/assets/minecraft/textures/stone.png");
        assert_eq!(
            relative_pack_path(root, changed),
            "assets/minecraft/textures/stone.png"
        );
    }

    #[test]
    fn relative_pack_path_normalizes_windows_separators() {
        let root = Path::new(r"D:\pack");
        let changed = Path::new(r"D:\pack\assets\minecraft\blockstates\stone.json");
        assert_eq!(
            relative_pack_path(root, changed),
            "assets/minecraft/blockstates/stone.json"
        );
    }

    #[test]
    fn jar_sources_skip_filesystem_watcher() {
        assert!(!should_watch_source(SourceKind::Jar));
        assert!(should_watch_source(SourceKind::Folder));
    }
}
