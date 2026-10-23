use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::audit;
use crate::error::AppError;
use crate::fsops::{self, ListDirFilter};
use crate::session::ActorId;
use crate::workspace::{self, WorkspaceInfo};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInspection {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_workspace: bool,
    pub workspace_name: Option<String>,
    pub schema_version: Option<u32>,
    /// True when the workspace already contains at least one user account.
    pub has_users: bool,
}

/// Blocking file work of `initWorkspace` (runs off the async runtime).
fn init_workspace_blocking(
    root: &std::path::Path,
    name: &str,
    machine_id: &str,
) -> Result<WorkspaceInfo, AppError> {
    let info = workspace::init(root, name)?;
    let _migrated = crate::migrate::run(root, machine_id)?;
    Ok(info)
}

/// Testable body of `initWorkspace`.
pub fn init_workspace_impl(
    state: &AppState,
    root: PathBuf,
    name: &str,
) -> Result<WorkspaceInfo, AppError> {
    let info = init_workspace_blocking(&root, name, &state.machine_id())?;
    state.set_workspace(root, info.clone());
    audit::emit(
        &ActorId::System("init"),
        "workspace.create",
        "workspace",
        &info.workspace_id,
        serde_json::json!({ "name": info.name }),
    );
    Ok(info)
}

/// Creates a workspace at `path` and activates it. `path` is the absolute
/// workspace root chosen by the user; it is the only place absolute paths are
/// accepted and it is never stored inside data files.
#[tauri::command(rename = "initWorkspace")]
pub async fn init_workspace(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
    name: String,
) -> Result<WorkspaceInfo, AppError> {
    let root = PathBuf::from(&path);
    let machine_id = state.machine_id();
    let root_for_task = root.clone();
    let name_for_task = name.clone();
    let app_for_task = app.clone();
    let info = tokio::task::spawn_blocking(move || {
        let info = init_workspace_blocking(&root_for_task, &name_for_task, &machine_id)?;
        crate::plugins::install_default_plugins(&root_for_task, &app_for_task)?;
        Ok::<_, AppError>(info)
    })
    .await
    .map_err(|e| AppError::new("IO", format!("init workspace task failed: {e}")))??;
    state.set_workspace(root, info.clone());
    audit::emit(
        &ActorId::System("init"),
        "workspace.create",
        "workspace",
        &info.workspace_id,
        serde_json::json!({ "name": info.name }),
    );
    Ok(info)
}

/// Blocking file work of `activateWorkspace` (migration, backfill, plugins).
fn activate_workspace_blocking(
    root: &std::path::Path,
    machine_id: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(WorkspaceInfo, bool), AppError> {
    let info = workspace::validate(root)?;
    let migrated = crate::migrate::run(root, machine_id)?;
    crate::backfill::run(root)?;
    if let Some(app) = app {
        crate::plugins::install_default_plugins(root, app)?;
    }
    Ok((info, migrated))
}

/// Shared tail of activation: state update, audit, session invalidation.
fn finalize_activation(
    state: &AppState,
    root: PathBuf,
    info: WorkspaceInfo,
    migrated: bool,
    had_session: bool,
) -> Result<WorkspaceInfo, AppError> {
    state.set_workspace(root, info.clone());
    if migrated {
        audit::emit(
            &ActorId::System("migrate"),
            "workspace.migrate",
            "workspace",
            &info.workspace_id,
            serde_json::json!({}),
        );
    }
    audit::emit(
        &ActorId::System("activate"),
        "workspace.activate",
        "workspace",
        &info.workspace_id,
        serde_json::json!({}),
    );
    if had_session && migrated {
        state.clear_session();
        return Err(AppError::new(
            "SESSION_INVALIDATED",
            "the workspace was migrated and the active session was invalidated",
        ));
    }
    Ok(info)
}

/// Testable body of `activateWorkspace`.
pub fn activate_workspace_impl(
    state: &AppState,
    root: PathBuf,
) -> Result<WorkspaceInfo, AppError> {
    let had_session = state.require_auth().is_ok();
    let machine_id = state.machine_id();
    let (info, migrated) = activate_workspace_blocking(&root, &machine_id, None)?;
    finalize_activation(state, root, info, migrated, had_session)
}

/// Validates and activates an existing workspace.
#[tauri::command(rename = "activateWorkspace")]
pub async fn activate_workspace(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<WorkspaceInfo, AppError> {
    let root = PathBuf::from(&path);
    let had_session = state.require_auth().is_ok();
    let machine_id = state.machine_id();
    let root_for_task = root.clone();
    let app_for_task = app.clone();
    let (info, migrated) = tokio::task::spawn_blocking(move || {
        activate_workspace_blocking(&root_for_task, &machine_id, Some(&app_for_task))
    })
    .await
    .map_err(|e| AppError::new("IO", format!("activate workspace task failed: {e}")))??;
    finalize_activation(&state, root, info, migrated, had_session)
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
    let mut has_users = false;
    if is_dir {
        if let Ok(info) = workspace::validate(&candidate) {
            is_workspace = true;
            workspace_name = Some(info.name);
            schema_version = Some(info.schema_version);
            let filter = ListDirFilter {
                extensions: Some(vec!["json".to_string()]),
                include_hidden: None,
            };
            has_users = fsops::list_dir(&candidate, "users", &filter)
                .map(|entries| !entries.is_empty())
                .unwrap_or(false);
        }
    }
    Ok(FolderInspection {
        path,
        exists,
        is_dir,
        is_workspace,
        workspace_name,
        schema_version,
        has_users,
    })
}
