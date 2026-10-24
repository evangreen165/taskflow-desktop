use tauri::State;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use taskflow_macros::write_command;

use crate::audit;
use crate::error::AppError;
use crate::session::{ActorId, Session, SessionView};
use crate::users::{self, UserInfo};
use crate::workspace;
use crate::AppState;

fn login_hash(login: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(login.trim().to_lowercase().as_bytes());
    hex::encode(hasher.finalize())
}

/// Machine-local "remember me" token: `{base64url(userId)}.{hmacHex}`. The HMAC
/// key is the per-machine id, so the token is only valid on the machine that
/// issued it and it is bound to the user's current password hash.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RememberToken {
    pub token: String,
}

fn hmac_hex(machine_id: &str, data: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;
    let mut mac =
        HmacSha256::new_from_slice(machine_id.as_bytes()).expect("hmac accepts any key length");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Builds the in-memory session for an already-authenticated account (common
/// tail of password login and remember-token auto-login). The session expires
/// after the admin-configured lifetime (`config.json > sessionLifetimeDays`,
/// 0 = never).
fn establish_session(state: &AppState, info: &UserInfo) -> Result<SessionView, AppError> {
    let root = state.root()?;
    users::touch_last_login(&root, &info.id)?;
    let expires_at = workspace::session_lifetime_window(&root)?
        .map(|window| chrono::Utc::now().timestamp() + window);
    state.set_session(Session {
        user_id: info.id.clone(),
        login: info.login.clone(),
        display_name: info.display_name.clone(),
        role_id: info.role_id.clone(),
        avatar_color: info.avatar_color.clone(),
        must_change_password: info.must_change_password,
        login_at: audit::now_rfc3339(),
        expires_at,
        role_missing_reported: false,
    });
    audit::emit(
        &ActorId::User(info.id.clone()),
        "auth.login",
        "user",
        &info.id,
        serde_json::json!({}),
    );
    state.session()
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
    establish_session(state, &user)?;
    Ok(user)
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
        expires_at: session.expires_at,
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

/// `authLoginRemember` — verifies credentials (like `authLogin`) and returns a
/// machine-local remember-me token bound to the user's password hash and the
/// configured session lifetime. The token is stored by the frontend in the
/// machine-local Tauri store, never in the SMB workspace.
///
/// Format: `{base64url(userId)}.{hmac}.{expiresAtUnix}` where the HMAC covers
/// `userId:passwordHash:expiresAt`. `expiresAt` 0 means "never expire"
/// (lifetime 0).
fn remember_token_impl(
    state: &AppState,
    login: &str,
    password: &str,
) -> Result<RememberToken, AppError> {
    let view = auth_login_impl(state, login, password)?;
    let root = state.root()?;
    let account = users::find_by_id(&root, &view.user.id)?;
    let expires_at = workspace::session_lifetime_window(&root)?
        .map(|window| chrono::Utc::now().timestamp() + window)
        .unwrap_or(0);
    let payload = format!("{}:{}:{}", account.id, account.password_hash, expires_at);
    let encoded_id = URL_SAFE_NO_PAD.encode(account.id.as_bytes());
    let token = format!(
        "{encoded_id}.{}.{expires_at}",
        hmac_hex(&state.machine_id(), &payload)
    );
    tracing::info!(user_id = %account.id, expires_at, "Generated remember-me token: {}", token);
    Ok(RememberToken { token })
}

#[tauri::command(rename = "authLoginRemember")]
pub fn auth_login_remember(
    state: State<'_, AppState>,
    login: String,
    password: String,
) -> Result<RememberToken, AppError> {
    remember_token_impl(&state, &login, &password)
}

/// `authAutoLogin` — validates a machine-local remember-me token and restores
/// the session. The token is machine-bound (HMAC keyed by the machine id),
/// tied to the current password hash, and expires at the admin-configured
/// session lifetime (`expiresAt`). A password change, a copy to another
/// machine, or an elapsed lifetime invalidates it.
fn auto_login_impl(state: &AppState, token: &str) -> Result<SessionView, AppError> {
    let root = state.root()?;
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(AppError::new("TOKEN_INVALID", "malformed remember token"));
    }
    let id_bytes = URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| AppError::new("TOKEN_INVALID", "malformed remember token"))?;
    let user_id = String::from_utf8(id_bytes)
        .map_err(|_| AppError::new("TOKEN_INVALID", "malformed remember token"))?;
    let expires_at: i64 = parts[2]
        .parse()
        .map_err(|_| AppError::new("TOKEN_INVALID", "malformed remember token"))?;
    if expires_at != 0 && chrono::Utc::now().timestamp() > expires_at {
        tracing::warn!(user_id = %user_id, expires_at, "auto-login failed: token expired");
        return Err(AppError::new(
            "TOKEN_EXPIRED",
            "remember-me token has expired, please log in again",
        ));
    }

    let account = users::find_by_id(&root, &user_id)?;
    if !account.is_active {
        return Err(AppError::new("AUTH_FAILED", "account is disabled"));
    }
    let payload = format!("{}:{}:{}", account.id, account.password_hash, expires_at);
    if parts[1] != hmac_hex(&state.machine_id(), &payload) {
        return Err(AppError::new("TOKEN_INVALID", "invalid remember token"));
    }

    establish_session(state, &UserInfo::from(&account))
}

#[tauri::command(rename = "authAutoLogin")]
pub fn auth_auto_login(
    state: State<'_, AppState>,
    token: String,
) -> Result<SessionView, AppError> {
    auto_login_impl(&state, &token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace;
    use tempfile::tempdir;

    fn activated(dir: &tempfile::TempDir, machine_id: &str) -> AppState {
        let state = AppState::new(machine_id.to_string());
        state.set_workspace(
            dir.path().to_path_buf(),
            workspace::validate(dir.path()).unwrap(),
        );
        state
    }

    #[test]
    fn remember_token_roundtrips_auto_login() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Remember").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("machine-1".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        let token = remember_token_impl(&state, "admin", "password123").unwrap();
        assert!(token.token.contains('.'));

        let state2 = activated(&dir, "machine-1");
        let view = auto_login_impl(&state2, &token.token).unwrap();
        assert_eq!(view.user.id, admin.id);
        assert!(state2.require_auth().is_ok());
    }

    #[test]
    fn auto_login_rejects_tampered_malformed_foreign_and_expired_tokens() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Remember2").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("machine-1".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        let token = remember_token_impl(&state, "admin", "password123").unwrap();

        let state2 = activated(&dir, "machine-1");
        let (encoded_id, _, _) = {
            let mut parts = token.token.splitn(3, '.');
            (parts.next().unwrap(), parts.next().unwrap(), parts.next().unwrap())
        };
        let tampered = format!("{encoded_id}.ffff.0");
        assert_eq!(
            auto_login_impl(&state2, &tampered).unwrap_err().code,
            "TOKEN_INVALID"
        );
        assert_eq!(
            auto_login_impl(&state2, "no-dot").unwrap_err().code,
            "TOKEN_INVALID"
        );
        // A token issued on another machine never validates.
        let state3 = activated(&dir, "machine-2");
        assert_eq!(
            auto_login_impl(&state3, &token.token).unwrap_err().code,
            "TOKEN_INVALID"
        );
        // A correctly-signed token whose expiresAt lies in the past is rejected
        // with TOKEN_EXPIRED.
        let account = users::find_by_id(dir.path(), &admin.id).unwrap();
        let payload = format!("{}:{}:1", account.id, account.password_hash);
        let expired = format!(
            "{}.{}.1",
            URL_SAFE_NO_PAD.encode(account.id.as_bytes()),
            hmac_hex(&state2.machine_id(), &payload)
        );
        assert_eq!(
            auto_login_impl(&state2, &expired).unwrap_err().code,
            "TOKEN_EXPIRED"
        );
    }

    #[test]
    fn expired_session_is_cleared_on_next_call() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Expire").unwrap();
        users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("machine-1".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(Session {
            user_id: "any-id".into(),
            login: "admin".into(),
            display_name: "A".into(),
            role_id: "admin".into(),
            avatar_color: "#000".into(),
            must_change_password: false,
            login_at: audit::now_rfc3339(),
            expires_at: Some(chrono::Utc::now().timestamp() - 1),
            role_missing_reported: false,
        });
        assert_eq!(state.require_auth().unwrap_err().code, "AUTH_REQUIRED");
        // The expired session was cleared: it cannot come back.
        assert!(state.require_auth().is_err());
    }

    #[test]
    fn auto_login_invalidated_after_password_change() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Remember3").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("machine-1".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        let token = remember_token_impl(&state, "admin", "password123").unwrap();

        users::change_password(dir.path(), &admin.id, "password123", "new-password-1").unwrap();

        let state2 = activated(&dir, "machine-1");
        assert_eq!(
            auto_login_impl(&state2, &token.token).unwrap_err().code,
            "TOKEN_INVALID"
        );
    }
}
