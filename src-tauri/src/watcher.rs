/// File-system watcher using the `notify` crate.
/// Watches a source path and emits Tauri events when it changes externally.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

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

impl SourceWatcher {
    pub fn new(app: AppHandle, source_path: PathBuf) -> notify::Result<Self> {
        let app_clone = app.clone();
        let path_str = source_path.to_string_lossy().to_string();

        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    let kind_str = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Modify(_) => "modify",
                        EventKind::Remove(_) => "remove",
                        _ => return,
                    };
                    let _ = app_clone.emit(
                        EVENT_SOURCE_CHANGED,
                        SourceChangedPayload {
                            path: path_str.clone(),
                            kind: kind_str.to_string(),
                        },
                    );
                    let _ = app_clone.emit(EVENT_CACHE_INVALIDATED, ());
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        let watch_path = if source_path.is_dir() {
            source_path.clone()
        } else {
            source_path.parent().map(Path::to_path_buf).unwrap_or(source_path.clone())
        };

        watcher.watch(&watch_path, RecursiveMode::Recursive)?;
        Ok(Self { _watcher: watcher })
    }
}

/// Global active watcher (one per app instance).
pub type SharedWatcher = Arc<Mutex<Option<SourceWatcher>>>;

pub fn install_watcher(
    app: AppHandle,
    source_path: PathBuf,
    shared: &SharedWatcher,
) {
    match SourceWatcher::new(app, source_path) {
        Ok(w) => {
            *shared.lock().expect("watcher mutex") = Some(w);
        }
        Err(e) => {
            tracing::warn!("file watcher failed to start: {e}");
        }
    }
}

pub fn stop_watcher(shared: &SharedWatcher) {
    *shared.lock().expect("watcher mutex") = None;
}
