mod builtins;
mod compile;
pub mod dto;
mod error;
mod image;
mod index;
mod ipc;
mod logging;
mod model;
mod resolve;
mod search;
mod save;
mod source;
mod state;
mod watcher;

use state::{AppState, SharedState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init_logging(app.handle());
            Ok(())
        })
        .manage(SharedState::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            ipc::get_app_info,
            ipc::ping,
            ipc::open_source,
            ipc::close_source,
            ipc::cancel_index,
            ipc::query_assets,
            ipc::get_asset_facets,
            ipc::get_texture_preview,
            ipc::get_texture,
            ipc::get_texture_binary,
            ipc::save_texture_mcmeta,
            ipc::list_variants,
            ipc::models_for_texture,
            ipc::resolve_renderable,
            ipc::save_textures,
            ipc::save_batch,
            ipc::get_save_journal,
            ipc::list_project_backups,
            ipc::restore_project_backup,
            ipc::restore_project_backup_by_id,
            ipc::create_project_backup,
            ipc::reveal_log_dir,
            ipc::stream_demo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
