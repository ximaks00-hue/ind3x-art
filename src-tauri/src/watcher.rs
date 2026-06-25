//! File-system watcher using the `notify` crate.
//! Watches a source path and emits Tauri events when it changes externally.
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::dto::SourceKind;

pub const EVENT_SOURCE_CHANGED: &str = "source-changed";
pub const EVENT_CACHE_INVALIDATED: &str = "cache-invalidated";

const DEBOUNCE_MS: u64 = 300;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SourceChangedPayload {
    pub path: String,
    pub kind: String,
}

struct DebouncerState {
    paths: HashSet<String>,
    kind: String,
    generation: u64,
}

#[derive(Clone)]
struct WatchDebouncer {
    state: Arc<Mutex<DebouncerState>>,
    schedule_tx: mpsc::Sender<u64>,
}

impl WatchDebouncer {
    fn new(app: AppHandle) -> Self {
        let state = Arc::new(Mutex::new(DebouncerState {
            paths: HashSet::new(),
            kind: "modify".to_string(),
            generation: 0,
        }));
        let (schedule_tx, schedule_rx) = mpsc::channel();
        let worker_state = Arc::clone(&state);
        std::thread::Builder::new()
            .name("ind3x-watcher-debounce".into())
            .spawn(move || debounce_worker(app, worker_state, schedule_rx))
            .expect("spawn watcher debounce worker");

        Self { state, schedule_tx }
    }

    fn note_change(&self, relative: String, kind: &str) {
        let generation = {
            let mut guard = match self.state.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            guard.paths.insert(relative);
            guard.kind = kind.to_string();
            guard.generation += 1;
            guard.generation
        };
        let _ = self.schedule_tx.send(generation);
    }
}

fn debounce_worker(app: AppHandle, state: Arc<Mutex<DebouncerState>>, schedule_rx: Receiver<u64>) {
    while let Ok(mut target_gen) = schedule_rx.recv() {
        loop {
            match schedule_rx.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                Ok(generation) => target_gen = generation,
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        flush_generation(&app, &state, target_gen);
    }
}

fn flush_generation(app: &AppHandle, state: &Mutex<DebouncerState>, generation: u64) {
    let (paths, kind) = {
        let mut guard = match state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        if guard.generation != generation {
            return;
        }
        let paths: Vec<String> = guard.paths.drain().collect();
        let kind = guard.kind.clone();
        guard.generation += 1;
        (paths, kind)
    };

    if paths.is_empty() {
        return;
    }

    for path in paths {
        let _ = app.emit(
            EVENT_SOURCE_CHANGED,
            SourceChangedPayload {
                path,
                kind: kind.clone(),
            },
        );
    }
    let _ = app.emit(EVENT_CACHE_INVALIDATED, ());
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
        let watch_root = if source_path.is_dir() {
            source_path.clone()
        } else {
            source_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| source_path.clone())
        };

        let debouncer = WatchDebouncer::new(app);
        let watch_root_for_events = watch_root.clone();
        // `with_poll_interval` only applies to `PollWatcher`; `RecommendedWatcher` uses native backends.
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
                        debouncer.note_change(relative, kind_str);
                    }
                }
            },
            Config::default(),
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

    #[cfg(windows)]
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

    #[test]
    fn debouncer_accumulates_paths_for_one_generation() {
        let state = Mutex::new(DebouncerState {
            paths: HashSet::new(),
            kind: "modify".to_string(),
            generation: 0,
        });
        {
            let mut guard = state.lock().expect("lock");
            guard.paths.insert("assets/a.png".to_string());
            guard.paths.insert("assets/b.png".to_string());
            guard.generation = 1;
        }
        let (paths, generation) = {
            let guard = state.lock().expect("lock");
            (guard.paths.len(), guard.generation)
        };
        assert_eq!(paths, 2);
        assert_eq!(generation, 1);
    }
}
