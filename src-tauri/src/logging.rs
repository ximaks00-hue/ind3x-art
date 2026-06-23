use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_logging(app: &AppHandle) {
    let log_dir = app
        .path()
        .app_log_dir()
        .ok()
        .and_then(|dir| std::fs::create_dir_all(&dir).ok().map(|_| dir));

    if let Some(dir) = &log_dir {
        let _ = LOG_DIR.set(dir.clone());
    }

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "ind3x_art=info,tauri=info".into());

    let stdout_layer = tracing_subscriber::fmt::layer();

    if let Some(dir) = log_dir {
        let file_appender = tracing_appender::rolling::daily(dir, "ind3x-art.log");
        let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
        std::mem::forget(_guard);

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

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
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
