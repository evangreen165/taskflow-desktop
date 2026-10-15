use std::path::{Path, PathBuf};

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;

const AVATAR_COLORS: [&str; 6] = [
    "#5b5bd6", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
];

/// Persisted account record (includes the password hash). v2 schema: `id` is a
/// UUID; the filename stays `users/{login}.json`; `login` is immutable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub email: Option<String>,
    pub password_hash: String,
    pub role_id: String,
    pub avatar_color: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
    pub is_active: bool,
    pub must_change_password: bool,
}

/// Account record safe to send to the UI (no password hash, no salt).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub email: Option<String>,
    pub role_id: String,
    pub avatar_color: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
    pub is_active: bool,
    pub must_change_password: bool,
}

impl From<&User> for UserInfo {
    fn from(u: &User) -> Self {
        Self {
            id: u.id.clone(),
            login: u.login.clone(),
            display_name: u.display_name.clone(),
            email: u.email.clone(),
            role_id: u.role_id.clone(),
            avatar_color: u.avatar_color.clone(),
            created_at: u.created_at.clone(),
            last_login_at: u.last_login_at.clone(),
            is_active: u.is_active,
            must_change_password: u.must_change_password,
        }
    }
}

/// Editable fields for `usersUpdate` — a patch that never touches password
/// fields.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPatch {
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role_id: Option<String>,
    pub avatar_color: Option<String>,
    pub is_active: Option<bool>,
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default().hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, phc: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(phc)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn is_valid_login(login: &str) -> bool {
    let mut chars = login.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    login.len() <= 64
        && login
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_' || c == '-')
}

fn validate_password(password: &str) -> Result<(), AppError> {
    let len = password.chars().count();
    if len < 8 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "password must be at least 8 characters",
        ));
    }
    if len > 256 {
        return Err(AppError::new("INVALID_INPUT", "password is too long"));
    }
    Ok(())
}

fn avatar_color(login: &str) -> String {
    let sum: u32 = login.bytes().map(u32::from).sum();
    AVATAR_COLORS[(sum as usize) % AVATAR_COLORS.len()].to_string()
}

fn user_path(root: &Path, login: &str) -> PathBuf {
    root.join("users").join(format!("{login}.json"))
}

fn write_user(root: &Path, user: &User) -> Result<(), AppError> {
    fsops::write_json_atomic(&user_path(root, &user.login), user)
}

/// Resolves an account by its `id`, scanning `users/` (the filename is the
/// immutable login).
pub fn find_by_id(root: &Path, id: &str) -> Result<User, AppError> {
    for entry in std::fs::read_dir(root.join("users"))
        .map_err(|e| AppError::io("list users", e))?
    {
        let entry = entry.map_err(|e| AppError::io("read users dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let user: User = fsops::read_json(&path)?;
        if user.id == id {
            return Ok(user);
        }
    }
    Err(AppError::new("NOT_FOUND", "user not found"))
}

/// Registers a new account. Exclusive create: never overwrites an existing
/// user. `email` of an empty string is stored as `None`.
pub fn create(
    root: &Path,
    login: &str,
    password: &str,
    display_name: &str,
    role_id: &str,
    email: Option<String>,
) -> Result<UserInfo, AppError> {
    let login = login.trim().to_lowercase();
    if !is_valid_login(&login) {
        return Err(AppError::new(
            "INVALID_INPUT",
            "login must start with a lowercase letter and contain only a-z, 0-9, '.', '_' or '-'",
        ));
    }
    validate_password(password)?;
    let display_name = display_name.trim();
    if display_name.is_empty() || display_name.chars().count() > 120 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "display name must be between 1 and 120 characters",
        ));
    }
    let role_path = root.join("roles").join(format!("{role_id}.json"));
    if !role_path.exists() {
        return Err(AppError::new("NOT_FOUND", format!("role '{role_id}' does not exist")));
    }
    let email = email.map(|e| e.trim().to_string()).filter(|e| !e.is_empty());

    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        login: login.clone(),
        display_name: display_name.to_string(),
        email,
        password_hash: hash_password(password)?,
        role_id: role_id.to_string(),
        avatar_color: avatar_color(&login),
        created_at: now_rfc3339(),
        last_login_at: None,
        is_active: true,
        must_change_password: false,
    };
    let mut bytes = serde_json::to_vec_pretty(&user)?;
    bytes.push(b'\n');
    fsops::create_exclusive(&user_path(root, &login), &bytes)?;
    Ok(UserInfo::from(&user))
}

/// Creates the first administrator during onboarding (pre-session, not gated).
pub fn create_admin(
    root: &Path,
    login: &str,
    password: &str,
    full_name: &str,
) -> Result<UserInfo, AppError> {
    create(root, login, password, full_name, "admin", None)
}

/// Verifies credentials and returns the account. Inactive accounts cannot log
/// in. Does not touch `lastLoginAt` (the caller does that via
/// `touch_last_login`).
pub fn authenticate(root: &Path, login: &str, password: &str) -> Result<UserInfo, AppError> {
    let login = login.trim().to_lowercase();
    let path = user_path(root, &login);
    if !path.exists() {
        return Err(AppError::new("AUTH_FAILED", "invalid login or password"));
    }
    let user: User = fsops::read_json(&path)?;
    if !user.is_active {
        return Err(AppError::new("AUTH_FAILED", "account is disabled"));
    }
    if !verify_password(password, &user.password_hash)? {
        return Err(AppError::new("AUTH_FAILED", "invalid login or password"));
    }
    Ok(UserInfo::from(&user))
}

/// Self-service password change: old password must verify; on success the
/// forced-change flag is cleared.
pub fn change_password(
    root: &Path,
    user_id: &str,
    old_password: &str,
    new_password: &str,
) -> Result<UserInfo, AppError> {
    let mut user = find_by_id(root, user_id)?;
    if !verify_password(old_password, &user.password_hash)? {
        return Err(AppError::new("AUTH_FAILED", "current password is incorrect"));
    }
    validate_password(new_password)?;
    user.password_hash = hash_password(new_password)?;
    user.must_change_password = false;
    write_user(root, &user)?;
    Ok(UserInfo::from(&user))
}

/// Admin password reset: forces the user to change it on next login.
pub fn reset_password(
    root: &Path,
    user_id: &str,
    new_password: &str,
) -> Result<UserInfo, AppError> {
    let mut user = find_by_id(root, user_id)?;
    validate_password(new_password)?;
    user.password_hash = hash_password(new_password)?;
    user.must_change_password = true;
    write_user(root, &user)?;
    Ok(UserInfo::from(&user))
}

/// Records the successful login timestamp.
pub fn touch_last_login(root: &Path, user_id: &str) -> Result<UserInfo, AppError> {
    let mut user = find_by_id(root, user_id)?;
    user.last_login_at = Some(now_rfc3339());
    write_user(root, &user)?;
    Ok(UserInfo::from(&user))
}

/// Lists every account, sanitized, sorted by login.
pub fn list(root: &Path) -> Result<Vec<UserInfo>, AppError> {
    let dir = root.join("users");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| AppError::io(format!("list '{}'", dir.display()), e))?
    {
        let entry = entry.map_err(|e| AppError::io("read users dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let user: User = fsops::read_json(&path)?;
        out.push(UserInfo::from(&user));
    }
    out.sort_by(|a, b| a.login.cmp(&b.login));
    Ok(out)
}

fn count_active_admins_excluding(root: &Path, exclude_id: &str) -> usize {
    list(root)
        .map(|users| {
            users
                .iter()
                .filter(|u| u.is_active && u.role_id == "admin" && u.id != exclude_id)
                .count()
        })
        .unwrap_or(0)
}

/// Number of active administrators (guard rail for the last-active-admin rule).
#[allow(dead_code)]
pub fn count_active_admins(root: &Path) -> usize {
    list(root)
        .map(|users| users.iter().filter(|u| u.is_active && u.role_id == "admin").count())
        .unwrap_or(0)
}

/// Applies a patch. The last active admin cannot be deactivated or demoted.
pub fn update(root: &Path, user_id: &str, patch: UserPatch) -> Result<UserInfo, AppError> {
    let mut user = find_by_id(root, user_id)?;
    let was_active_admin = user.is_active && user.role_id == "admin";

    if let Some(name) = patch.display_name {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 120 {
            return Err(AppError::new(
                "INVALID_INPUT",
                "display name must be between 1 and 120 characters",
            ));
        }
        user.display_name = name.to_string();
    }
    if let Some(email) = patch.email {
        let email = email.trim();
        user.email = if email.is_empty() { None } else { Some(email.to_string()) };
    }
    if let Some(role_id) = patch.role_id {
        let role_path = root.join("roles").join(format!("{role_id}.json"));
        if !role_path.exists() {
            return Err(AppError::new("NOT_FOUND", format!("role '{role_id}' does not exist")));
        }
        user.role_id = role_id;
    }
    if let Some(color) = patch.avatar_color {
        user.avatar_color = color;
    }
    if let Some(active) = patch.is_active {
        user.is_active = active;
    }

    let is_active_admin = user.is_active && user.role_id == "admin";
    if was_active_admin
        && !is_active_admin
        && count_active_admins_excluding(root, user_id) == 0
    {
        return Err(AppError::new(
            "LAST_ACTIVE_ADMIN",
            "cannot deactivate or demote the last active administrator",
        ));
    }

    write_user(root, &user)?;
    Ok(UserInfo::from(&user))
}

/// Deactivates an account (guarded by the last-active-admin rule).
pub fn deactivate(root: &Path, user_id: &str) -> Result<UserInfo, AppError> {
    let mut user = find_by_id(root, user_id)?;
    let was_active_admin = user.is_active && user.role_id == "admin";
    user.is_active = false;
    if was_active_admin && count_active_admins_excluding(root, user_id) == 0 {
        return Err(AppError::new(
            "LAST_ACTIVE_ADMIN",
            "cannot deactivate or demote the last active administrator",
        ));
    }
    write_user(root, &user)?;
    Ok(UserInfo::from(&user))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace;
    use tempfile::tempdir;

    fn ws() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        workspace::init(dir.path(), "Users WS").unwrap();
        dir
    }

    fn admin(dir: &tempfile::TempDir) -> UserInfo {
        create_admin(dir.path(), "Admin", "password123", "Алексей Ковалёв").unwrap()
    }

    fn second_admin(dir: &tempfile::TempDir) -> UserInfo {
        create(dir.path(), "admin2", "password123", "Второй админ", "admin", None).unwrap()
    }

    #[test]
    fn password_hash_roundtrip() {
        let h = hash_password("s3cret-pass").unwrap();
        assert!(h.starts_with("$argon2"));
        assert!(verify_password("s3cret-pass", &h).unwrap());
        assert!(!verify_password("wrong", &h).unwrap());
    }

    #[test]
    fn create_admin_and_authenticate() {
        let dir = ws();
        let a = admin(&dir);
        assert_eq!(a.login, "admin");
        assert_eq!(a.role_id, "admin");
        assert_eq!(a.display_name, "Алексей Ковалёв");
        assert!(!a.id.is_empty());
        assert!(a.is_active);
        assert!(!a.must_change_password);
        assert!(a.last_login_at.is_none());
        assert!(dir.path().join("users").join("admin.json").exists());

        let logged = authenticate(dir.path(), "admin", "password123").unwrap();
        assert_eq!(logged.login, "admin");
        assert_eq!(logged.id, a.id);
    }

    #[test]
    fn authenticate_rejects_bad_password_unknown_and_inactive() {
        let dir = ws();
        admin(&dir);
        assert_eq!(
            authenticate(dir.path(), "admin", "nope").unwrap_err().code,
            "AUTH_FAILED"
        );
        assert_eq!(
            authenticate(dir.path(), "ghost", "x").unwrap_err().code,
            "AUTH_FAILED"
        );

        second_admin(&dir);
        let a = authenticate(dir.path(), "admin", "password123").unwrap();
        update(
            dir.path(),
            &a.id,
            UserPatch {
                is_active: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            authenticate(dir.path(), "admin", "password123").unwrap_err().code,
            "AUTH_FAILED"
        );
    }

    #[test]
    fn create_is_exclusive_and_validated() {
        let dir = ws();
        admin(&dir);
        assert_eq!(
            create_admin(dir.path(), "admin", "password123", "Admin").unwrap_err().code,
            "ALREADY_EXISTS"
        );
        assert!(create_admin(dir.path(), "1bad", "password123", "X").is_err());
        assert!(create_admin(dir.path(), "ok", "short", "X").is_err());
        assert!(create_admin(dir.path(), "ok", "password123", "  ").is_err());
        assert!(create(dir.path(), "ok", "password123", "X", "missing_role", None).is_err());
    }

    #[test]
    fn change_password_rotates_hash() {
        let dir = ws();
        let a = admin(&dir);
        let updated = change_password(dir.path(), &a.id, "password123", "new-pass-1").unwrap();
        assert!(!updated.must_change_password);
        assert_eq!(authenticate(dir.path(), "admin", "new-pass-1").unwrap().id, a.id);
        assert_eq!(
            authenticate(dir.path(), "admin", "password123").unwrap_err().code,
            "AUTH_FAILED"
        );
        assert_eq!(
            change_password(dir.path(), &a.id, "wrong-old", "x-new-pass").unwrap_err().code,
            "AUTH_FAILED"
        );
    }

    #[test]
    fn reset_password_forces_change() {
        let dir = ws();
        let a = admin(&dir);
        let updated = reset_password(dir.path(), &a.id, "forced-new-pass").unwrap();
        assert!(updated.must_change_password);
        assert_eq!(
            authenticate(dir.path(), "admin", "forced-new-pass").unwrap().id,
            a.id
        );
        let changed = change_password(dir.path(), &a.id, "forced-new-pass", "final-pass").unwrap();
        assert!(!changed.must_change_password);
    }

    #[test]
    fn touch_last_login_sets_timestamp() {
        let dir = ws();
        let a = admin(&dir);
        assert!(a.last_login_at.is_none());
        let t = touch_last_login(dir.path(), &a.id).unwrap();
        assert!(t.last_login_at.is_some());
    }

    #[test]
    fn update_patches_fields_and_never_touches_password() {
        let dir = ws();
        let a = admin(&dir);
        second_admin(&dir);
        create(dir.path(), "manager", "password123", "M", "manager", None).unwrap();
        let updated = update(
            dir.path(),
            &a.id,
            UserPatch {
                display_name: Some("Новый".to_string()),
                email: Some("admin@example.com".to_string()),
                role_id: Some("manager".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.display_name, "Новый");
        assert_eq!(updated.email.as_deref(), Some("admin@example.com"));
        assert_eq!(updated.role_id, "manager");
        assert_eq!(
            authenticate(dir.path(), "admin", "password123").unwrap().id,
            a.id
        );
    }

    #[test]
    fn deactivate_and_last_active_admin_guard() {
        let dir = ws();
        let a = admin(&dir);
        assert_eq!(deactivate(dir.path(), &a.id).unwrap_err().code, "LAST_ACTIVE_ADMIN");

        let second = second_admin(&dir);
        deactivate(dir.path(), &a.id).unwrap();
        assert!(!find_by_id(dir.path(), &a.id).unwrap().is_active);

        assert_eq!(
            update(
                dir.path(),
                &second.id,
                UserPatch {
                    role_id: Some("observer".to_string()),
                    ..Default::default()
                },
            )
            .unwrap_err()
            .code,
            "LAST_ACTIVE_ADMIN"
        );
    }

    #[test]
    fn find_by_id_and_list() {
        let dir = ws();
        let a = admin(&dir);
        create(dir.path(), "bob", "password123", "Bob", "observer", None).unwrap();
        let found = find_by_id(dir.path(), &a.id).unwrap();
        assert_eq!(found.login, "admin");
        let listed = list(dir.path()).unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].login, "admin");
        assert_eq!(listed[1].login, "bob");
        assert!(find_by_id(dir.path(), "missing-id").is_err());
    }

    #[test]
    fn user_info_omits_password_fields() {
        let dir = ws();
        let info = admin(&dir);
        let raw = std::fs::read_to_string(dir.path().join("users").join("admin.json")).unwrap();
        assert!(raw.contains("passwordHash"));
        assert!(raw.contains("$argon2"));
        assert!(!raw.contains("passwordSalt"));
        let json = serde_json::to_value(&info).unwrap();
        assert!(json.get("passwordHash").is_none());
        assert!(json.get("passwordSalt").is_none());
        assert!(json.get("id").is_some());
        assert!(json.get("displayName").is_some());
        assert!(json.get("roleId").is_some());
    }
}
