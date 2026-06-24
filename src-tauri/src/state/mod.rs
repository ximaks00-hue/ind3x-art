pub mod query;

mod project;

pub use project::{arc_catalog, CatalogState, IndexState, SaveState};

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use sled::Db;

use crate::dto::{AppInfo, ProjectHandle, SourceKind};
use crate::error::{CoreError, CoreResult};
use crate::logging;
use crate::model::types::ResolvedModel;
use crate::source::AssetSource;

pub struct Project {
    pub source_path: PathBuf,
    pub source_kind: SourceKind,
    pub pack_format: Option<u32>,
    pub source: Box<dyn AssetSource>,
    pub index: IndexState,
    pub catalog: CatalogState,
    pub save: SaveState,
}

pub struct AppState {
    next_handle: AtomicU64,
    pub projects: HashMap<u64, Project>,
    pub cancel_flags: HashMap<u64, Arc<AtomicBool>>,
    pub db: Db,
    pub watcher: crate::watcher::SharedWatcher,
}

impl AppState {
    pub fn new() -> CoreResult<Self> {
        let db = open_cache_db()?;

        Ok(Self {
            next_handle: AtomicU64::new(1),
            projects: HashMap::new(),
            cancel_flags: HashMap::new(),
            db,
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
        db,
        watcher: Arc::new(std::sync::Mutex::new(HashMap::new())),
    })
}

fn open_cache_db() -> CoreResult<Db> {
    let base = std::env::temp_dir().join("ind3x-art-cache");
    std::fs::create_dir_all(&base).map_err(CoreError::from)?;
    prune_legacy_cache_dirs(&base);
    let db_path = base.join("index-v1");
    sled::open(db_path).map_err(CoreError::from)
}

fn prune_legacy_cache_dirs(base: &std::path::Path) {
    let Ok(read_dir) = std::fs::read_dir(base) else {
        return;
    };
    for entry in read_dir.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == "index-v1" {
            continue;
        }
        if name.chars().all(|c| c.is_ascii_digit()) {
            if let Err(err) = std::fs::remove_dir_all(entry.path()) {
                tracing::warn!(path = %entry.path().display(), error = %err, "failed to prune legacy cache dir");
            }
        }
    }
}

pub fn lock_model_cache(
    cache: &std::sync::Mutex<HashMap<String, ResolvedModel>>,
) -> CoreResult<std::sync::MutexGuard<'_, HashMap<String, ResolvedModel>>> {
    cache
        .lock()
        .map_err(|_| CoreError::Internal("model cache poisoned".into()))
}

#[derive(Clone)]
pub struct SharedState(pub Arc<RwLock<AppState>>);

impl SharedState {
    pub fn new(state: AppState) -> Self {
        Self(Arc::new(RwLock::new(state)))
    }

    pub fn read(&self) -> CoreResult<std::sync::RwLockReadGuard<'_, AppState>> {
        self.0
            .read()
            .map_err(|_| CoreError::Internal("state poisoned".into()))
    }

    pub fn write(&self) -> CoreResult<std::sync::RwLockWriteGuard<'_, AppState>> {
        self.0
            .write()
            .map_err(|_| CoreError::Internal("state poisoned".into()))
    }
}
