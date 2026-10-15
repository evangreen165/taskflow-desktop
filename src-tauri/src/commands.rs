use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::audit;
use crate::error::AppError;
use crate::fsops::{self, DirEntry, FileHash, ListDirFilter};
use crate::locking::{self, LockStatus};
use crate::users::{self, UserInfo};
use crate::workspace::{self, WorkspaceInfo};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub workspace: Option<WorkspaceInfo>,
    pub user: Option<UserInfo>,
    pub machine_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInspection {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_workspace: bool,
    pub workspace_name: Option<String>,
    pub schema_version: Option<u32>,
}

// ---------------------------------------------------------------------------
// Workspace lifecycle
// ---------------------------------------------------------------------------

/// Creates a workspace at `path` and activates it. `path` is the absolute
/// workspace root chosen by the user; it is the only place absolute paths are
/// accepted and it is never stored inside data files.
#[tauri::command(rename = "initWorkspace")]
pub fn init_workspace(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<WorkspaceInfo, AppError> {
    let root = PathBuf::from(&path);
    let info = workspace::init(&root, &name)?;
    state.set_workspace(root, info.clone());
    audit::emit(
        "system",
        "workspace.create",
        "workspace",
        &info.workspace_id,
        serde_json::json!({ "name": info.name }),
    );
    Ok(info)
}

/// Validates and activates an existing workspace.
#[tauri::command(rename = "activateWorkspace")]
pub fn activate_workspace(
    state: State<'_, AppState>,
    path: String,
) -> Result<WorkspaceInfo, AppError> {
    let root = PathBuf::from(&path);
    let info = workspace::validate(&root)?;
    state.set_workspace(root, info.clone());
    audit::emit(
        "system",
        "workspace.activate",
        "workspace",
        &info.workspace_id,
        serde_json::json!({}),
    );
    Ok(info)
}

/// Inspects a candidate folder without activating it (used by onboarding).
#[tauri::command(rename = "inspectFolder")]
pub fn inspect_folder(path: String) -> Result<FolderInspection, AppError> {
    let candidate = PathBuf::from(&path);
    let exists = candidate.exists();
    let is_dir = candidate.is_dir();
    let mut is_workspace = false;
    let mut workspace_name = None;
    let mut schema_version = None;
    if is_dir {
        if let Ok(info) = workspace::validate(&candidate) {
            is_workspace = true;
            workspace_name = Some(info.name);
            schema_version = Some(info.schema_version);
        }
    }
    Ok(FolderInspection {
        path,
        exists,
        is_dir,
        is_workspace,
        workspace_name,
        schema_version,
    })
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

#[tauri::command(rename = "createAdmin")]
pub fn create_admin(
    state: State<'_, AppState>,
    login: String,
    password: String,
    full_name: String,
) -> Result<UserInfo, AppError> {
    let root = state.root()?;
    let info = users::create_admin(&root, &login, &password, &full_name)?;
    audit::write_event(
        &root,
        "system",
        "user.created",
        "user",
        &info.login,
        serde_json::json!({ "role": info.role }),
    )?;
    audit::emit(
        "system",
        "user.create",
        "user",
        &info.login,
        serde_json::json!({ "role": info.role }),
    );
    Ok(info)
}

#[tauri::command(rename = "login")]
pub fn login(
    state: State<'_, AppState>,
    login: String,
    password: String,
) -> Result<UserInfo, AppError> {
    let root = state.root()?;
    let user = users::login(&root, &login, &password)?;
    state.set_user(user.clone());
    audit::emit(
        &user.login,
        "auth.login",
        "user",
        &user.login,
        serde_json::json!({}),
    );
    Ok(user)
}

#[tauri::command(rename = "logout")]
pub fn logout(state: State<'_, AppState>) {
    let actor = state.actor();
    state.clear_user();
    audit::emit(&actor, "auth.logout", "user", &actor, serde_json::json!({}));
}

#[tauri::command(rename = "getSession")]
pub fn get_session(state: State<'_, AppState>) -> SessionInfo {
    state.session()
}

// ---------------------------------------------------------------------------
// Storage primitives (paths are relative to the workspace root)
// ---------------------------------------------------------------------------

#[tauri::command(rename = "readJson")]
pub fn read_json(state: State<'_, AppState>, path: String) -> Result<Value, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::read_json(&full)
}

#[tauri::command(rename = "writeJsonAtomic")]
pub fn write_json_atomic(
    state: State<'_, AppState>,
    path: String,
    value: Value,
) -> Result<(), AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_json_atomic(&full, &value)
}

#[tauri::command(rename = "readText")]
pub fn read_text(state: State<'_, AppState>, path: String) -> Result<String, AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::read_text(&full)
}

#[tauri::command(rename = "writeTextAtomic")]
pub fn write_text_atomic(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::write_text_atomic(&full, &content)
}

/// Creates an empty file exclusively (O_CREAT|O_EXCL semantics).
#[tauri::command(rename = "createExclusive")]
pub fn create_exclusive(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::create_exclusive(&full, b"")
}

#[tauri::command(rename = "removePath")]
pub fn remove_path(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let root = state.root()?;
    let full = crate::path::resolve_rel(&root, &path)?;
    fsops::remove_path(&full)
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
// Locks
// ---------------------------------------------------------------------------

#[tauri::command(rename = "acquireLock")]
pub fn acquire_lock(
    state: State<'_, AppState>,
    key: String,
    ttl_sec: u64,
) -> Result<LockStatus, AppError> {
    let root = state.root()?;
    let owner = state.machine_id();
    locking::acquire(&root, &key, ttl_sec, &owner)
}

#[tauri::command(rename = "releaseLock")]
pub fn release_lock(
    state: State<'_, AppState>,
    key: String,
    token: String,
) -> Result<(), AppError> {
    let root = state.root()?;
    locking::release(&root, &key, &token)
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
