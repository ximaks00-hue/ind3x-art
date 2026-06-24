//! IPC command-flow integration tests (open / save / reindex).
//! Exercises the same code paths as `ipc::project` and `ipc::save` without a Tauri runtime.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::ipc::Channel;
use tempfile::TempDir;

use crate::dto::{
    IndexEvent, ProjectHandle, SaveMode, SaveOptions, SourceKind, TextureSaveEntry,
};
use crate::index::source_fingerprint;
use crate::ipc::helpers::{
    prepare_opened_project, refresh_project_for_paths,
};
use crate::save::{prepare_textures, save_prepared_textures};
use crate::source::open_source as load_source;
use crate::state::{arc_catalog, SharedState};

const SAMPLE_PNG_B64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

fn noop_channel() -> Channel<IndexEvent> {
    Channel::new(|_| Ok(()))
}

fn simple_pack_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack")
}

fn shared_state_with_db() -> (SharedState, sled::Db) {
    let app = crate::state::test_app_state().expect("test app state");
    let db = app.db.clone();
    (SharedState::new(app), db)
}

fn lang_pack_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/lang_pack")
}

fn insert_opened_project(
    state: &SharedState,
    source_path: &std::path::Path,
    prepared: crate::ipc::helpers::OpenPreparedProject,
) -> ProjectHandle {
    let handle = {
        let mut app = state.write().expect("state write");
        let handle = app.alloc_handle();
        let source_kind = prepared.source.source_kind();
        app.projects.insert(
            handle.id,
            crate::state::Project {
                source_path: source_path.to_path_buf(),
                source_kind,
                pack_format: prepared.pack_format,
                source: prepared.source,
                index: crate::state::IndexState {
                    fingerprint: prepared.fingerprint.clone(),
                    entries: prepared.entries.clone(),
                    entry_id_index: HashMap::new(),
                    texture_model_index: prepared.texture_model_index,
                    model_cache: Mutex::new(HashMap::new()),
                },
                catalog: {
                    let entries = arc_catalog(prepared.catalog);
                    let id_index = crate::state::build_catalog_id_index(&entries);
                    crate::state::CatalogState {
                        entries,
                        id_index,
                        creative_tab_order: prepared.creative_tab_order,
                        language: prepared.catalog_language,
                    }
                },
                save: crate::state::SaveState {
                    journal: Vec::new(),
                },
            },
        );
        handle
    };
    {
        let mut app = state.write().expect("state write");
        if let Some(project) = app.projects.get_mut(&handle.id) {
            crate::ipc::helpers::apply_texture_link_counts(project);
            crate::ipc::helpers::refresh_entry_id_index(project);
        }
    }
    handle
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) {
    std::fs::create_dir_all(dst).expect("create dest root");
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let rel = entry
            .path()
            .strip_prefix(src)
            .expect("strip prefix");
        let dest = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&dest).expect("mkdir");
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).expect("mkdir parent");
            }
            std::fs::copy(entry.path(), &dest).expect("copy file");
        }
    }
}

#[test]
fn open_source_flow_indexes_simple_pack() {
    let root = simple_pack_root();
    let (state, db) = shared_state_with_db();
    let cancel = Arc::new(AtomicBool::new(false));
    let channel = noop_channel();
    let source = load_source(&root).expect("open source");
    let fingerprint = source_fingerprint(source.source_path()).expect("fingerprint");

    let prepared = prepare_opened_project(
        &root,
        source.source_kind(),
        fingerprint,
        &db,
        &cancel,
        &channel,
        None,
    )
    .expect("prepare open");

    assert!(!prepared.entries.is_empty(), "index should contain assets");
    assert!(
        !prepared.catalog.is_empty(),
        "catalog should be built for simple pack"
    );

    let handle = insert_opened_project(&state, &root, prepared);
    let app = state.read().expect("state read");
    let project = app.projects.get(&handle.id).expect("project");
    assert_eq!(project.source_kind, SourceKind::Folder);
    assert!(!project.catalog.entries.is_empty());
}

#[test]
fn save_textures_flow_writes_and_refreshes_index() {
    let tmp = TempDir::new().expect("temp dir");
    copy_dir_all(&lang_pack_root(), tmp.path());

    let (state, db) = shared_state_with_db();
    let cancel = Arc::new(AtomicBool::new(false));
    let channel = noop_channel();
    let source = load_source(tmp.path()).expect("open source");
    let fingerprint = source_fingerprint(source.source_path()).expect("fingerprint");
    let prepared = prepare_opened_project(
        tmp.path(),
        source.source_kind(),
        fingerprint,
        &db,
        &cancel,
        &channel,
        None,
    )
    .expect("prepare open");
    let handle = insert_opened_project(&state, tmp.path(), prepared);

    let texture_path = "assets/minecraft/textures/block/test_stone.png";
    let options = SaveOptions {
        mode: SaveMode::Overwrite,
        target_path: None,
        namespace: None,
    };
    let prepared_save = prepare_textures(
        vec![TextureSaveEntry {
            path: texture_path.to_string(),
            png_base64: SAMPLE_PNG_B64.to_string(),
            target_path: None,
        }],
        &options,
    )
    .expect("prepare textures");

    let (original_paths, saved_paths, _backup) =
        save_prepared_textures(tmp.path(), SourceKind::Folder, prepared_save, &options)
            .expect("save textures");
    assert_eq!(saved_paths, vec![texture_path.to_string()]);
    assert_eq!(original_paths, vec![texture_path.to_string()]);

    let handle_id = handle.id;
    {
        let mut app = state.write().expect("state write");
        refresh_project_for_paths(&mut app, &db, handle, &saved_paths).expect("refresh index");
    }

    let app = state.read().expect("state read");
    let project = app.projects.get(&handle_id).expect("project");
    assert!(
        project.index.entries.iter().any(|e| e.path == texture_path),
        "index should still list saved texture"
    );
    let bytes = project.source.read(texture_path).expect("read saved texture");
    assert!(bytes.starts_with(b"\x89PNG"));
}

#[test]
fn reindex_project_flow_patches_changed_texture() {
    let tmp = TempDir::new().expect("temp dir");
    copy_dir_all(&lang_pack_root(), tmp.path());

    let (state, db) = shared_state_with_db();
    let cancel = Arc::new(AtomicBool::new(false));
    let channel = noop_channel();
    let source = load_source(tmp.path()).expect("open source");
    let fingerprint = source_fingerprint(source.source_path()).expect("fingerprint");
    let prepared = prepare_opened_project(
        tmp.path(),
        source.source_kind(),
        fingerprint,
        &db,
        &cancel,
        &channel,
        None,
    )
    .expect("prepare open");
    let entry_count = prepared.entries.len();
    let handle = insert_opened_project(&state, tmp.path(), prepared);

    let texture_path = "assets/minecraft/textures/block/test_stone.png";
    let new_bytes = STANDARD.decode(SAMPLE_PNG_B64).expect("decode png");
    let abs = tmp.path().join(texture_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    std::fs::write(&abs, &new_bytes).expect("write texture");

    let handle_id = handle.id;
    {
        let mut app = state.write().expect("state write");
        refresh_project_for_paths(
            &mut app,
            &db,
            handle,
            &[texture_path.to_string()],
        )
        .expect("partial reindex");
    }

    let app = state.read().expect("state read");
    let project = app.projects.get(&handle_id).expect("project");
    assert!(
        project.index.entries.len() >= entry_count.saturating_sub(1),
        "partial reindex should keep index populated"
    );
    let reread = project.source.read(texture_path).expect("reread texture");
    assert_eq!(reread, new_bytes);
}
