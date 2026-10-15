use tauri::State;

use taskflow_macros::write_command;

use crate::audit;
use crate::error::AppError;
use crate::permissions;
use crate::roles::{self, Role, RolePatch};
use crate::session::ActorId;
use crate::AppState;

#[tauri::command(rename = "rolesList")]
pub fn roles_list(state: State<'_, AppState>) -> Result<Vec<Role>, AppError> {
    state.require_auth()?;
    roles::list(&state.root()?)
}

pub fn roles_create_impl(
    state: &AppState,
    id: String,
    name: String,
    description: String,
    color: String,
    perms: Vec<String>,
) -> Result<Role, AppError> {
    state.require_writable()?;
    let session = state.require_perm("roles.manage")?;
    let root = state.root()?;
    let role = roles::create(&root, &id, &name, &description, &color, perms)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "role.create",
        "role",
        &role.id,
        serde_json::json!({}),
    );
    Ok(role)
}

#[write_command(rename = "rolesCreate")]
pub fn roles_create(
    state: State<'_, AppState>,
    id: String,
    name: String,
    description: String,
    color: String,
    permissions: Vec<String>,
) -> Result<Role, AppError> {
    roles_create_impl(&state, id, name, description, color, permissions)
}

pub fn roles_update_impl(
    state: &AppState,
    id: String,
    patch: RolePatch,
) -> Result<Role, AppError> {
    state.require_writable()?;
    let session = state.require_perm("roles.manage")?;
    let root = state.root()?;
    let role = roles::update(&root, &id, patch)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "role.update",
        "role",
        &role.id,
        serde_json::json!({}),
    );
    Ok(role)
}

#[write_command(rename = "rolesUpdate")]
pub fn roles_update(
    state: State<'_, AppState>,
    id: String,
    patch: RolePatch,
) -> Result<Role, AppError> {
    roles_update_impl(&state, id, patch)
}

pub fn roles_delete_impl(state: &AppState, id: String) -> Result<(), AppError> {
    state.require_writable()?;
    let session = state.require_perm("roles.manage")?;
    let root = state.root()?;
    roles::delete(&root, &id)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "role.delete",
        "role",
        &id,
        serde_json::json!({}),
    );
    Ok(())
}

#[write_command(rename = "rolesDelete")]
pub fn roles_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    roles_delete_impl(&state, id)
}

#[tauri::command(rename = "permissionsList")]
pub fn permissions_list(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    state.require_auth()?;
    Ok(permissions::ALL.iter().map(|p| p.to_string()).collect())
}
