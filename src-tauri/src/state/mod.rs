pub mod query;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use sled::Db;

use crate::dto::{AppInfo, AssetEntry, ModelRefInfo, ProjectHandle, SourceKind};
use crate::logging;
use crate::model::types::ResolvedModel;
use crate::source::AssetSource;

pub struct Project {
    pub source_path: PathBuf,
    pub source_kind: SourceKind,
    #[allow(dead_code)]
    pub fingerprint: String,
    pub pack_format: Option<u32>,
    pub entries: Vec<AssetEntry>,
    pub catalog: Vec<crate::dto::CatalogEntry>,
    #[allow(dead_code)]
    pub source: Box<dyn AssetSource>,
    pub model_cache: std::sync::Mutex<HashMap<String, ResolvedModel>>,
    pub texture_model_index: HashMap<String, Vec<ModelRefInfo>>,
    pub save_journal: Vec<crate::dto::SaveJournalEntry>,
}

pub struct AppState {
    next_handle: AtomicU64,
    pub projects: HashMap<u64, Project>,
    pub cancel_flags: HashMap<u64, Arc<AtomicBool>>,
    pub db: Db,
    pub watcher: crate::watcher::SharedWatcher,
}

impl Default for AppState {
    fn default() -> Self {
        let cache_dir = std::env::temp_dir().join(format!(
            "ind3x-art-cache/{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let db = sled::open(cache_dir).expect("failed to open index cache database");

        Self {
            next_handle: AtomicU64::new(1),
            projects: HashMap::new(),
            cancel_flags: HashMap::new(),
            db,
            watcher: std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }
}

impl AppState {
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

#[derive(Clone)]
pub struct SharedState(pub Arc<RwLock<AppState>>);

impl SharedState {
    pub fn new(state: AppState) -> Self {
        Self(Arc::new(RwLock::new(state)))
    }

    pub fn read(
        &self,
    ) -> std::sync::RwLockReadGuard<'_, AppState> {
        self.0.read().expect("state poisoned")
    }

    pub fn write(
        &self,
    ) -> std::sync::RwLockWriteGuard<'_, AppState> {
        self.0.write().expect("state poisoned")
    }
}
