use serde_json::Value;
use tauri::{AppHandle, State};

use taskflow_macros::write_command;

use crate::error::AppError;
use crate::fsops::{self, DirEntry, FileHash, ListDirFilter};
use crate::locking::{self, LockStatus};
use crate::AppState;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

#[tauri::command(rename = "readJson")]
pub fn read_json(state: State<'_, AppState>, path: String) -> Result<Value, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::read_json(&full)
}

#[tauri::command(rename = "readText")]
pub fn read_text(state: State<'_, AppState>, path: String) -> Result<String, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::read_text(&full)
}

#[tauri::command(rename = "exists")]
pub fn exists(state: State<'_, AppState>, path: String) -> Result<bool, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    Ok(fsops::path_exists(&full))
}

#[tauri::command(rename = "listDir")]
pub fn list_dir(
    state: State<'_, AppState>,
    path: String,
    filter: Option<ListDirFilter>,
) -> Result<Vec<DirEntry>, AppError> {
    let root = state.root()?;
    fsops::list_dir(&root, &path, &filter.unwrap_or_default())
}

#[tauri::command(rename = "hashFile")]
pub fn hash_file(state: State<'_, AppState>, path: String) -> Result<FileHash, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::hash_file(&full)
}

// ---------------------------------------------------------------------------
// Writes (gated by require_writable via #[write_command])
// ---------------------------------------------------------------------------

pub fn write_json_atomic_impl(
    state: &AppState,
    path: String,
    value: Value,
) -> Result<(), AppError> {
    state.require_writable()?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_json_atomic(&full, &value)
}

#[write_command(rename = "writeJsonAtomic")]
pub fn write_json_atomic(
    state: State<'_, AppState>,
    path: String,
    value: Value,
) -> Result<(), AppError> {
    write_json_atomic_impl(&state, path, value)
}

pub fn write_text_atomic_impl(
    state: &AppState,
    path: String,
    content: String,
) -> Result<(), AppError> {
    state.require_writable()?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_text_atomic(&full, &content)
}

#[write_command(rename = "writeTextAtomic")]
pub fn write_text_atomic(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), AppError> {
    write_text_atomic_impl(&state, path, content)
}

/// Creates an empty file exclusively (O_CREAT|O_EXCL semantics).
pub fn create_exclusive_impl(state: &AppState, path: String) -> Result<(), AppError> {
    state.require_writable()?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::create_exclusive(&full, b"")
}

#[write_command(rename = "createExclusive")]
pub fn create_exclusive(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    create_exclusive_impl(&state, path)
}

pub fn remove_path_impl(state: &AppState, path: String) -> Result<(), AppError> {
    state.require_writable()?;
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::remove_path(&full)
}

#[write_command(rename = "removePath")]
pub fn remove_path(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    remove_path_impl(&state, path)
}

// ---------------------------------------------------------------------------
// Locks
// ---------------------------------------------------------------------------

pub fn acquire_lock_impl(
    state: &AppState,
    key: String,
    ttl_sec: u64,
) -> Result<LockStatus, AppError> {
    state.require_writable()?;
    let root = state.root()?;
    let owner = state.machine_id();
    locking::acquire(&root, &key, ttl_sec, &owner)
}

#[write_command(rename = "acquireLock")]
pub fn acquire_lock(
    state: State<'_, AppState>,
    key: String,
    ttl_sec: u64,
) -> Result<LockStatus, AppError> {
    acquire_lock_impl(&state, key, ttl_sec)
}

pub fn release_lock_impl(state: &AppState, key: String, token: String) -> Result<(), AppError> {
    state.require_writable()?;
    let root = state.root()?;
    locking::release(&root, &key, &token)
}

#[write_command(rename = "releaseLock")]
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
