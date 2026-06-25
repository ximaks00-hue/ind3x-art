pub mod query;

mod project;

pub use project::{arc_catalog, build_catalog_id_index, CatalogState, IndexState, SaveState};

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use sled::Db;

use crate::dto::{AppInfo, ProjectHandle};
use crate::error::{CoreError, CoreResult};
use crate::logging;
use crate::model::types::ResolvedModel;
use crate::source::AssetSource;

/// Bump when on-disk sled layout or cache semantics change.
pub const CACHE_SCHEMA_VERSION: &str = "v2";

/// Projects remain in `AppState.projects` as `Arc<RwLock<Project>>` for their lifetime.
/// Blocking IPC takes a per-project write lock instead of removing the project from the map.

pub struct Project {
    pub source_path: PathBuf,
    pub source_kind: crate::dto::SourceKind,
    pub pack_format: Option<u32>,
    pub source: Box<dyn AssetSource>,
    pub index: IndexState,
    pub catalog: CatalogState,
    pub save: SaveState,
}

pub fn project_arc(
    projects: &HashMap<u64, Arc<RwLock<Project>>>,
    handle: u64,
) -> CoreResult<Arc<RwLock<Project>>> {
    projects
        .get(&handle)
        .cloned()
        .ok_or(CoreError::ProjectNotFound)
}

pub fn read_project(
    arc: &Arc<RwLock<Project>>,
) -> CoreResult<std::sync::RwLockReadGuard<'_, Project>> {
    match arc.read() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            tracing::error!(
                "recovering poisoned project read lock — state may be inconsistent; consider reopening the pack"
            );
            Ok(poisoned.into_inner())
        }
    }
}

pub fn write_project(
    arc: &Arc<RwLock<Project>>,
) -> CoreResult<std::sync::RwLockWriteGuard<'_, Project>> {
    match arc.write() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            tracing::error!(
                "recovering poisoned project write lock — state may be inconsistent; consider reopening the pack"
            );
            Ok(poisoned.into_inner())
        }
    }
}

pub struct AppState {
    next_handle: AtomicU64,
    pub projects: HashMap<u64, Arc<RwLock<Project>>>,
    pub cancel_flags: HashMap<u64, Arc<AtomicBool>>,
    /// Per-request cancel flags keyed by frontend-allocated IPC request id.
    pub ipc_requests: HashMap<u64, Arc<AtomicBool>>,
    pub db: Db,
    /// Session-only sled when the on-disk cache is locked by another instance.
    pub cache_ephemeral: bool,
    pub watcher: crate::watcher::SharedWatcher,
}

impl AppState {
    pub fn new(cache_root: PathBuf) -> CoreResult<Self> {
        let (db, cache_ephemeral) = open_cache_db(&cache_root)?;

        Ok(Self {
            next_handle: AtomicU64::new(1),
            projects: HashMap::new(),
            cancel_flags: HashMap::new(),
            ipc_requests: HashMap::new(),
            db,
            cache_ephemeral,
            watcher: std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())),
        })
    }
    pub fn app_info(&self) -> AppInfo {
        AppInfo {
            name: "inD3X Art".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            identifier: "com.ind3x.art".to_string(),
            target: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
            profile: if cfg!(debug_assertions) {
                "debug".to_string()
            } else {
                "release".to_string()
            },
            log_dir: logging::log_directory().map(|p| p.to_string_lossy().to_string()),
            cache_ephemeral: self.cache_ephemeral,
        }
    }

    pub fn alloc_handle(&self) -> ProjectHandle {
        ProjectHandle {
            id: self.next_handle.fetch_add(1, Ordering::Relaxed),
        }
    }

    pub fn register_cancel(&mut self, handle: u64) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancel_flags.insert(handle, Arc::clone(&flag));
        flag
    }

    pub fn cancel_index(&self, handle: u64) {
        if let Some(flag) = self.cancel_flags.get(&handle) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn clear_cancel(&mut self, handle: u64) {
        self.cancel_flags.remove(&handle);
    }

    pub fn register_ipc_request(&mut self, request_id: u64) {
        self.ipc_requests
            .entry(request_id)
            .or_insert_with(|| Arc::new(AtomicBool::new(false)));
    }

    pub fn cancel_ipc_request_flag(&mut self, request_id: u64) {
        self.ipc_requests
            .entry(request_id)
            .or_insert_with(|| Arc::new(AtomicBool::new(true)))
            .store(true, Ordering::Relaxed);
    }

    pub fn finish_ipc_request(&mut self, request_id: u64) {
        self.ipc_requests.remove(&request_id);
    }

    pub fn is_ipc_request_cancelled(&self, request_id: u64) -> bool {
        self.ipc_requests
            .get(&request_id)
            .is_some_and(|flag| flag.load(Ordering::Relaxed))
    }
}

#[cfg(test)]
pub fn test_app_state() -> CoreResult<AppState> {
    let db = sled::Config::new()
        .temporary(true)
        .open()
        .map_err(CoreError::from)?;
    Ok(AppState {
        next_handle: AtomicU64::new(1),
        projects: HashMap::new(),
        cancel_flags: HashMap::new(),
        ipc_requests: HashMap::new(),
        db,
        cache_ephemeral: false,
        watcher: Arc::new(std::sync::Mutex::new(HashMap::new())),
    })
}

pub fn open_cache_db(app_cache_root: &Path) -> CoreResult<(Db, bool)> {
    let cache_root = app_cache_root
        .join("ind3x-art")
        .join("cache")
        .join(CACHE_SCHEMA_VERSION);
    std::fs::create_dir_all(&cache_root).map_err(CoreError::from)?;
    note_legacy_temp_cache();
    let db_path = cache_root.join("sled");
    match sled::open(&db_path) {
        Ok(db) => Ok((db, false)),
        Err(err) if cache_db_lock_conflict(&err) => {
            tracing::warn!(
                path = %db_path.display(),
                %err,
                "persistent cache locked by another instance — using in-memory session cache"
            );
            let db = sled::Config::new()
                .temporary(true)
                .open()
                .map_err(CoreError::from)?;
            Ok((db, true))
        }
        Err(err) => Err(err.into()),
    }
}

fn cache_db_lock_conflict(err: &sled::Error) -> bool {
    match err {
        sled::Error::Io(io) => {
            matches!(
                io.kind(),
                std::io::ErrorKind::AlreadyExists
                    | std::io::ErrorKind::PermissionDenied
                    | std::io::ErrorKind::WouldBlock
            ) || io
                .to_string()
                .to_ascii_lowercase()
                .contains("lock")
        }
        _ => false,
    }
}

fn note_legacy_temp_cache() {
    let legacy = std::env::temp_dir().join("ind3x-art-cache");
    if legacy.exists() {
        tracing::info!(
            path = %legacy.display(),
            "legacy temp cache directory found; app cache uses versioned path instead"
        );
    }
}

pub fn lock_model_cache(
    cache: &std::sync::Mutex<HashMap<String, Arc<ResolvedModel>>>,
) -> CoreResult<std::sync::MutexGuard<'_, HashMap<String, Arc<ResolvedModel>>>> {
    match cache.lock() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            tracing::error!(
                "recovering poisoned model cache mutex — cached models may be inconsistent"
            );
            Ok(poisoned.into_inner())
        }
    }
}

#[derive(Clone)]
pub struct SharedState(pub Arc<RwLock<AppState>>);

impl SharedState {
    pub fn new(state: AppState) -> Self {
        Self(Arc::new(RwLock::new(state)))
    }

    pub fn read(&self) -> CoreResult<std::sync::RwLockReadGuard<'_, AppState>> {
        match self.0.read() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                tracing::warn!("recovering poisoned app state read lock");
                Ok(poisoned.into_inner())
            }
        }
    }

    pub fn write(&self) -> CoreResult<std::sync::RwLockWriteGuard<'_, AppState>> {
        match self.0.write() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                tracing::warn!("recovering poisoned app state write lock");
                Ok(poisoned.into_inner())
            }
        }
    }
}

#[cfg(test)]
mod lock_recovery_tests {
    use super::*;

    #[test]
    fn shared_state_recovers_poisoned_rwlock() {
        let state = SharedState::new(test_app_state().expect("test state"));
        let arc = state.0.clone();
        let handle = std::thread::spawn(move || {
            let _guard = arc.write().expect("write lock");
            panic!("simulate poison");
        });
        let _ = handle.join();

        let guard = state.read().expect("read after poison recovery");
        assert_eq!(guard.next_handle.load(std::sync::atomic::Ordering::Relaxed), 1);
    }

    #[test]
    fn lock_model_cache_recovers_poisoned_mutex() {
        let cache = std::sync::Mutex::new(HashMap::<String, Arc<ResolvedModel>>::new());
        let arc = std::sync::Arc::new(cache);
        let arc_clone = arc.clone();
        let handle = std::thread::spawn(move || {
            let _guard = arc_clone.lock().expect("mutex lock");
            panic!("simulate poison");
        });
        let _ = handle.join();

        let guard = lock_model_cache(&arc).expect("mutex after poison recovery");
        assert!(guard.is_empty());
    }
}
