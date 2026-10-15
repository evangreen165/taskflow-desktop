use std::path::Path;
use std::sync::OnceLock;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::prelude::*;
use tracing_subscriber::{EnvFilter, Registry};

use crate::audit::AuditLayer;
use crate::error::AppError;

static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Installs the global tracing subscriber:
/// - `RUST_LOG`-aware env filter (defaults to `info`),
/// - human readable output on stderr,
/// - JSON lines in `<app_data>/logs/taskflow.log.<date>` (daily rotation),
/// - `AuditLayer` forwarding user actions to the workspace `audit/` log.
pub fn init(app_data_dir: &Path, audit_layer: AuditLayer) -> Result<(), AppError> {
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| AppError::io("create log directory", e))?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "taskflow.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    // Keep the writer worker alive for the whole process lifetime.
    let _ = LOG_GUARD.set(guard);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let stderr_layer = tracing_subscriber::fmt::layer().with_target(true);
    let file_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_ansi(false)
        .with_writer(non_blocking);

    let subscriber = Registry::default()
        .with(filter)
        .with(stderr_layer)
        .with(file_layer)
        .with(audit_layer);

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| AppError::new("LOG_INIT", e.to_string()))?;
    Ok(())
}