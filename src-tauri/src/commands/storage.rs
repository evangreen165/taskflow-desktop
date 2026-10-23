use serde_json::Value;
use tauri::{AppHandle, State};

use taskflow_macros::write_command;

use crate::error::AppError;
use crate::fsops::{self, DirEntry, FileHash, ListDirFilter};
use crate::locking::{self, LockStatus};
use crate::AppState;

/// Paths that must never be read or written directly over IPC; they have
/// dedicated commands (`usersList`, `rolesList`, `usersUpdate`, …) or are
/// internal. Blocks `users/`, `roles/`, `audit/`, `events/` prefixes and the
/// exact `config.json`.
fn check_forbidden_path(path: &str) -> Result<(), AppError> {
    let normalized = path.trim_start_matches('/').replace('\\', "/");
    let normalized = if let Some(rest) = normalized.strip_prefix("./") {
        rest.to_string()
    } else {
        normalized
    };
    let first = normalized.split('/').next().unwrap_or("");
    if matches!(first, "users" | "roles" | "audit" | "events") || normalized == "config.json" {
        return Err(AppError::new(
            "FORBIDDEN_PATH",
            format!("'{path}' is restricted"),
        ));
    }
    Ok(())
}

/// Auth-first wrapper: a session is required, then the path is validated.
fn require_authenticated_read(state: &AppState, path: &str) -> Result<(), AppError> {
    state.require_auth()?;
    check_forbidden_path(path)
}

// ---------------------------------------------------------------------------
// Reads (require an authenticated session; sensitive prefixes are blocked)
// ---------------------------------------------------------------------------

#[cfg(test)]
pub fn read_json_impl(state: &AppState, path: String) -> Result<Value, AppError> {
    require_authenticated_read(state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::read_json(&full)
}

#[tauri::command(rename = "readJson")]
#[tracing::instrument(skip(state))]
pub async fn read_json(state: State<'_, AppState>, path: String) -> Result<Value, AppError> {
    require_authenticated_read(&state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::read_json(&full))
        .await
        .map_err(|e| AppError::new("IO", format!("read task failed: {e}")))?
}

#[tauri::command(rename = "readText")]
#[tracing::instrument(skip(state))]
pub async fn read_text(state: State<'_, AppState>, path: String) -> Result<String, AppError> {
    require_authenticated_read(&state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::read_text(&full))
        .await
        .map_err(|e| AppError::new("IO", format!("read task failed: {e}")))?
}

#[cfg(test)]
pub fn exists_impl(state: &AppState, path: String) -> Result<bool, AppError> {
    require_authenticated_read(state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    Ok(fsops::path_exists(&full))
}

#[tauri::command(rename = "exists")]
#[tracing::instrument(skip(state))]
pub async fn exists(state: State<'_, AppState>, path: String) -> Result<bool, AppError> {
    require_authenticated_read(&state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    Ok(
        tokio::task::spawn_blocking(move || fsops::path_exists(&full))
            .await
            .map_err(|e| AppError::new("IO", format!("exists task failed: {e}")))?,
    )
}

#[cfg(test)]
pub fn list_dir_impl(
    state: &AppState,
    path: String,
    filter: Option<ListDirFilter>,
) -> Result<Vec<DirEntry>, AppError> {
    require_authenticated_read(state, &path)?;
    let root = state.root()?;
    fsops::list_dir(&root, &path, &filter.unwrap_or_default())
}

#[tauri::command(rename = "listDir")]
#[tracing::instrument(skip(state))]
pub async fn list_dir(
    state: State<'_, AppState>,
    path: String,
    filter: Option<ListDirFilter>,
) -> Result<Vec<DirEntry>, AppError> {
    require_authenticated_read(&state, &path)?;
    let root = state.root()?;
    let filter = filter.unwrap_or_default();
    tokio::task::spawn_blocking(move || fsops::list_dir(&root, &path, &filter))
        .await
        .map_err(|e| AppError::new("IO", format!("list task failed: {e}")))?
}

#[cfg(test)]
pub fn hash_file_impl(state: &AppState, path: String) -> Result<FileHash, AppError> {
    require_authenticated_read(state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::hash_file(&full)
}

#[tauri::command(rename = "hashFile")]
#[tracing::instrument(skip(state))]
pub async fn hash_file(state: State<'_, AppState>, path: String) -> Result<FileHash, AppError> {
    require_authenticated_read(&state, &path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::hash_file(&full))
        .await
        .map_err(|e| AppError::new("IO", format!("hash task failed: {e}")))?
}

// ---------------------------------------------------------------------------
// Writes (gated by require_writable via #[write_command])
// ---------------------------------------------------------------------------

#[cfg(test)]
pub fn write_json_atomic_impl(
    state: &AppState,
    path: String,
    value: Value,
) -> Result<(), AppError> {
    state.require_writable()?;
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_json_atomic(&full, &value)
}

#[write_command(rename = "writeJsonAtomic")]
pub async fn write_json_atomic(
    state: State<'_, AppState>,
    path: String,
    value: Value,
) -> Result<(), AppError> {
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::write_json_atomic(&full, &value))
        .await
        .map_err(|e| AppError::new("IO", format!("write task failed: {e}")))?
}

#[cfg(test)]
pub fn write_text_atomic_impl(
    state: &AppState,
    path: String,
    content: String,
) -> Result<(), AppError> {
    state.require_writable()?;
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_text_atomic(&full, &content)
}

#[write_command(rename = "writeTextAtomic")]
pub async fn write_text_atomic(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), AppError> {
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::write_text_atomic(&full, &content))
        .await
        .map_err(|e| AppError::new("IO", format!("write task failed: {e}")))?
}

/// Creates an empty file exclusively (O_CREAT|O_EXCL semantics).
#[cfg(test)]
pub fn create_exclusive_impl(state: &AppState, path: String) -> Result<(), AppError> {
    state.require_writable()?;
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::create_exclusive(&full, b"")
}

#[write_command(rename = "createExclusive")]
pub async fn create_exclusive(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::create_exclusive(&full, b""))
        .await
        .map_err(|e| AppError::new("IO", format!("create task failed: {e}")))?
}

#[cfg(test)]
pub fn remove_path_impl(state: &AppState, path: String) -> Result<(), AppError> {
    state.require_writable()?;
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::remove_path(&full)
}

#[write_command(rename = "removePath")]
pub async fn remove_path(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    check_forbidden_path(&path)?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    tokio::task::spawn_blocking(move || fsops::remove_path(&full))
        .await
        .map_err(|e| AppError::new("IO", format!("remove task failed: {e}")))?
}

// ---------------------------------------------------------------------------
// Locks (infrastructure: require auth, NOT writable — a mustChangePassword
// user may take locks but still cannot write user data)
// ---------------------------------------------------------------------------

pub fn acquire_lock_impl(
    state: &AppState,
    key: String,
    ttl_sec: u64,
) -> Result<LockStatus, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    let owner = state.machine_id();
    locking::acquire(&root, &key, ttl_sec, &owner)
}

#[tauri::command(rename = "acquireLock")]
pub fn acquire_lock(
    state: State<'_, AppState>,
    key: String,
    ttl_sec: u64,
) -> Result<LockStatus, AppError> {
    acquire_lock_impl(&state, key, ttl_sec)
}

pub fn release_lock_impl(state: &AppState, key: String, token: String) -> Result<(), AppError> {
    state.require_auth()?;
    let root = state.root()?;
    locking::release(&root, &key, &token)
}

#[tauri::command(rename = "releaseLock")]
pub fn release_lock(
    state: State<'_, AppState>,
    key: String,
    token: String,
) -> Result<(), AppError> {
    release_lock_impl(&state, key, token)
}

#[tauri::command(rename = "isLocked")]
pub fn is_locked(state: State<'_, AppState>, key: String) -> Result<LockStatus, AppError> {
    let root = state.root()?;
    locking::is_locked(&root, &key)
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/// Starts the workspace file watcher (idempotent). Change batches arrive on
/// the frontend as `workspace://fs-event`. `path` optionally narrows the watch
/// to a subfolder; when omitted the whole workspace root is watched.
#[tauri::command(rename = "watch")]
pub fn watch(
    state: State<'_, AppState>,
    app: AppHandle,
    path: Option<String>,
) -> Result<(), AppError> {
    state.ensure_watcher(&app, path.as_deref())
}
