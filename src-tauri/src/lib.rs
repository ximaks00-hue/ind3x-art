mod catalog;
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
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_panic_hook();

    let specta_builder = ipc::builder();

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init_logging(app.handle());
            let cache_root = app
                .path()
                .app_cache_dir()
                .or_else(|_| app.path().app_data_dir())
                .map_err(|error| -> Box<dyn std::error::Error> {
                    Box::new(std::io::Error::other(format!(
                        "failed to resolve app cache directory: {error}"
                    )))
                })?;
            let state = AppState::new(cache_root)
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            app.manage(SharedState::new(state));
            Ok(())
        })
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        logging::show_fatal_startup_error(&format!("{error}"));
        std::process::exit(1);
    }
}
