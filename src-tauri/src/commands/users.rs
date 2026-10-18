use tauri::State;

use taskflow_macros::write_command;

use crate::audit;
use crate::error::AppError;
use crate::session::ActorId;
use crate::users::{self, UserInfo, UserPatch};
use crate::AppState;

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
