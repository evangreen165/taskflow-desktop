use tauri::State;

use taskflow_macros::write_command;

use crate::audit;
use crate::error::AppError;
use crate::session::{ActorId, Session, SessionView};
use crate::users::{self, UserInfo};
use crate::AppState;

fn login_hash(login: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(login.trim().to_lowercase().as_bytes());
    hex::encode(hasher.finalize())
}

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
        &ActorId::System("bootstrap").label(),
        "user.created",
        "user",
        &info.login,
        serde_json::json!({ "role": info.role_id }),
    )?;
    audit::emit(
        &ActorId::System("bootstrap"),
        "user.create",
        "user",
        &info.login,
        serde_json::json!({ "role": info.role_id }),
    );
    Ok(info)
}

/// Testable body of `authLogin` (and the old login). Sets the in-memory
/// session; returns the sanitized user.
pub fn login_impl(
    state: &AppState,
    login: &str,
    password: &str,
) -> Result<UserInfo, AppError> {
    let root = state.root()?;
    let user = users::authenticate(&root, login, password)?;
    users::touch_last_login(&root, &user.id)?;
    state.set_session(Session {
        user_id: user.id.clone(),
        login: user.login.clone(),
        display_name: user.display_name.clone(),
        role_id: user.role_id.clone(),
        avatar_color: user.avatar_color.clone(),
        must_change_password: user.must_change_password,
        login_at: audit::now_rfc3339(),
        role_missing_reported: false,
    });
    audit::emit(
        &ActorId::User(user.id.clone()),
        "auth.login",
        "user",
        &user.id,
        serde_json::json!({}),
    );
    Ok(user)
}

/// `authLogin`: returns the full `SessionView`; failures emit
/// `auth.login_failed` with only the `loginHash` (never the plaintext login).
pub fn auth_login_impl(state: &AppState, login: &str, password: &str) -> Result<SessionView, AppError> {
    match login_impl(state, login, password) {
        Ok(_) => state.session(),
        Err(e) => {
            audit::emit(
                &ActorId::System("anonymous"),
                "auth.login_failed",
                "user",
                "",
                serde_json::json!({ "loginHash": login_hash(login) }),
            );
            Err(e)
        }
    }
}

#[tauri::command(rename = "authLogin")]
pub fn auth_login(
    state: State<'_, AppState>,
    login: String,
    password: String,
) -> Result<SessionView, AppError> {
    auth_login_impl(&state, &login, &password)
}

/// Testable body of `authLogout`. The actor is captured **before** the session
/// is cleared so the audit line names the user, never `s:anonymous`.
pub fn logout_impl(state: &AppState) {
    let actor = state.actor();
    state.clear_session();
    audit::emit(
        &actor,
        "auth.logout",
        "user",
        &actor.id(),
        serde_json::json!({}),
    );
}

#[tauri::command(rename = "authLogout")]
pub fn auth_logout(state: State<'_, AppState>) -> Result<(), AppError> {
    logout_impl(&state);
    Ok(())
}

/// `authChangePassword` — self-service only, exempt from `#[write_command]`
/// (must work while `mustChangePassword` is set). Clears the forced flag.
pub fn auth_change_password_impl(
    state: &AppState,
    old_password: &str,
    new_password: &str,
) -> Result<SessionView, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    users::change_password(&root, &session.user_id, old_password, new_password)?;
    audit::emit(
        &ActorId::User(session.user_id.clone()),
        "auth.change_password",
        "user",
        &session.user_id,
        serde_json::json!({}),
    );
    state.set_session(Session {
        user_id: session.user_id.clone(),
        login: session.login.clone(),
        display_name: session.display_name.clone(),
        role_id: session.role_id.clone(),
        avatar_color: session.avatar_color.clone(),
        must_change_password: false,
        login_at: session.login_at.clone(),
        role_missing_reported: session.role_missing_reported,
    });
    state.session()
}

#[tauri::command(rename = "authChangePassword")]
pub fn auth_change_password(
    state: State<'_, AppState>,
    old_password: String,
    new_password: String,
) -> Result<SessionView, AppError> {
    auth_change_password_impl(&state, &old_password, &new_password)
}

/// `authRegister` — admin creates an account; gated by `users.manage`.
pub fn auth_register_impl(
    state: &AppState,
    login: String,
    password: String,
    display_name: String,
    role_id: String,
    email: Option<String>,
) -> Result<UserInfo, AppError> {
    state.require_writable()?;
    let session = state.require_perm("users.manage")?;
    let root = state.root()?;
    let info = users::create(&root, &login, &password, &display_name, &role_id, email)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "user.create",
        "user",
        &info.id,
        serde_json::json!({ "roleId": info.role_id }),
    );
    Ok(info)
}

#[write_command(rename = "authRegister")]
pub fn auth_register(
    state: State<'_, AppState>,
    login: String,
    password: String,
    display_name: String,
    role_id: String,
    email: Option<String>,
) -> Result<UserInfo, AppError> {
    auth_register_impl(&state, login, password, display_name, role_id, email)
}

/// `authResetPassword` — admin forces a password change. Self-service reset is
/// forbidden (`SELF_RESET_FORBIDDEN`); use `authChangePassword`.
pub fn auth_reset_password_impl(
    state: &AppState,
    id: String,
    new_password: String,
) -> Result<UserInfo, AppError> {
    state.require_writable()?;
    let session = state.require_perm("users.manage")?;
    if session.user_id == id {
        return Err(AppError::new(
            "SELF_RESET_FORBIDDEN",
            "use authChangePassword to change your own password",
        ));
    }
    let root = state.root()?;
    let info = users::reset_password(&root, &id, &new_password)?;
    audit::emit(
        &ActorId::User(session.user_id),
        "user.reset_password",
        "user",
        &info.id,
        serde_json::json!({}),
    );
    Ok(info)
}

#[write_command(rename = "authResetPassword")]
pub fn auth_reset_password(
    state: State<'_, AppState>,
    id: String,
    new_password: String,
) -> Result<UserInfo, AppError> {
    auth_reset_password_impl(&state, id, new_password)
}

#[tauri::command(rename = "authRefreshSession")]
pub fn auth_refresh_session(state: State<'_, AppState>) -> Result<SessionView, AppError> {
    state.session()
}
