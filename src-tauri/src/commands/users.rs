use tauri::State;

use serde::Serialize;

use taskflow_macros::write_command;

use crate::audit;
use crate::error::AppError;
use crate::session::ActorId;
use crate::users::{self, UserInfo, UserPatch};
use crate::AppState;

/// Minimal, non-sensitive user projection used to render assignee avatars.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: String,
    pub display_name: String,
    pub avatar_color: String,
    pub avatar_sha256: Option<String>,
}

pub fn users_summaries_impl(
    state: &AppState,
    ids: Vec<String>,
) -> Result<Vec<UserSummary>, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    let wanted: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
    let users = users::list(&root)?;
    Ok(users
        .into_iter()
        .filter(|u| wanted.contains(u.id.as_str()))
        .map(|u| UserSummary {
            id: u.id,
            display_name: u.display_name,
            avatar_color: u.avatar_color,
            avatar_sha256: u.avatar_sha256,
        })
        .collect())
}

/// Resolves display name + avatar color for a set of user ids. Available to any
/// authenticated user (task cards show assignees); never exposes credentials.
#[tauri::command(rename = "usersSummaries")]
pub fn users_summaries(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Vec<UserSummary>, AppError> {
    users_summaries_impl(&state, ids)
}

/// Active-user directory for pickers (assignees). Authenticated, non-sensitive
/// projection only.
pub fn users_directory_impl(state: &AppState) -> Result<Vec<UserSummary>, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    let mut users: Vec<UserSummary> = users::list(&root)?
        .into_iter()
        .filter(|u| u.is_active)
        .map(|u| UserSummary {
            id: u.id,
            display_name: u.display_name,
            avatar_color: u.avatar_color,
            avatar_sha256: u.avatar_sha256,
        })
        .collect();
    users.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(users)
}

#[tauri::command(rename = "usersDirectory")]
pub fn users_directory(state: State<'_, AppState>) -> Result<Vec<UserSummary>, AppError> {
    users_directory_impl(&state)
}

#[tauri::command(rename = "usersList")]
pub fn users_list(state: State<'_, AppState>) -> Result<Vec<UserInfo>, AppError> {
    state.require_perm("users.manage")?;
    users::list(&state.root()?)
}

pub fn users_update_impl(
    state: &AppState,
    id: String,
    patch: UserPatch,
) -> Result<UserInfo, AppError> {
    state.require_writable()?;
    let session = state.require_perm("users.manage")?;
    let root = state.root()?;
    let target = users::find_by_id(&root, &id)?;
    if target.role_id == "admin" && target.is_active && users::count_active_admins(&root) == 1 {
        if let Some(new_role) = &patch.role_id {
            if new_role != "admin" {
                return Err(AppError::new(
                    "LAST_ADMIN",
                    "the last active administrator cannot be demoted",
                ));
            }
        }
        if patch.is_active == Some(false) {
            return Err(AppError::new(
                "LAST_ADMIN",
                "the last active administrator cannot be deactivated",
            ));
        }
    }
    let info = users::update(&root, &id, patch)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "user.update",
        "user",
        &info.id,
        serde_json::json!({}),
    );
    Ok(info)
}

#[write_command(rename = "usersUpdate")]
pub fn users_update(
    state: State<'_, AppState>,
    id: String,
    patch: UserPatch,
) -> Result<UserInfo, AppError> {
    users_update_impl(&state, id, patch)
}

pub fn users_deactivate_impl(state: &AppState, id: String) -> Result<UserInfo, AppError> {
    state.require_writable()?;
    let session = state.require_perm("users.manage")?;
    let root = state.root()?;
    let target = users::find_by_id(&root, &id)?;
    if target.role_id == "admin" && target.is_active && users::count_active_admins(&root) == 1 {
        return Err(AppError::new(
            "LAST_ADMIN",
            "the last active administrator cannot be deactivated",
        ));
    }
    let info = users::deactivate(&root, &id)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "user.deactivate",
        "user",
        &info.id,
        serde_json::json!({}),
    );
    Ok(info)
}

#[write_command(rename = "usersDeactivate")]
pub fn users_deactivate(state: State<'_, AppState>, id: String) -> Result<UserInfo, AppError> {
    users_deactivate_impl(&state, id)
}
