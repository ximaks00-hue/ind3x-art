mod asset_details;
mod builtins;
mod compile;
pub mod dto;
mod error;
mod image;
mod index;
pub mod ipc;
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

    let specta_builder = ipc::builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init_logging(app.handle());
            Ok(())
        })
        .manage(SharedState::new(AppState::default()))
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
