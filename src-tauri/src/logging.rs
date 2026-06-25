use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

pub fn init_logging(app: &AppHandle) {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "ind3x_art=info,tauri=info".into());
    let stdout_layer = tracing_subscriber::fmt::layer();

    let (log_dir, log_dir_warning) = match app.path().app_log_dir() {
        Ok(dir) => match std::fs::create_dir_all(&dir) {
            Ok(()) => (Some(dir), None),
            Err(error) => (
                None,
                Some(format!(
                    "failed to create log directory at {}: {error}",
                    dir.display()
                )),
            ),
        },
        Err(error) => (
            None,
            Some(format!("failed to resolve app log directory: {error}")),
        ),
    };

    if let Some(dir) = &log_dir {
        let _ = LOG_DIR.set(dir.clone());
        let file_appender = tracing_appender::rolling::daily(dir, "ind3x-art.log");
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
        let _ = LOG_GUARD.set(guard);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .with(
                tracing_subscriber::fmt::layer()
                    .with_writer(non_blocking)
                    .with_ansi(false),
            )
            .init();
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .init();
    }

    if let Some(reason) = log_dir_warning {
        tracing::warn!("{reason} — file logging disabled");
    }

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        file_logging = log_dir.is_some(),
        "inD3X Art starting"
    );
}

pub fn log_directory() -> Option<PathBuf> {
    LOG_DIR.get().cloned()
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        tracing::error!("application panic: {info}");
    }));
}

pub fn show_fatal_startup_error(message: &str) {
    tracing::error!("{message}");
    eprintln!("inD3X Art failed to start: {message}");
    rfd::MessageDialog::new()
        .set_title("inD3X Art")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
        .show();
}
