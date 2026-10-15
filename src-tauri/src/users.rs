use std::path::Path;

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

/// Persisted account record (includes the password hash).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub login: String,
    pub name: String,
    pub password_hash: String,
    pub role: String,
    pub created_at: String,
    pub avatar_color: String,
}

/// Account record safe to send to the UI (no password hash).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub login: String,
    pub name: String,
    pub role: String,
    pub created_at: String,
    pub avatar_color: String,
}

impl From<&User> for UserInfo {
    fn from(u: &User) -> Self {
        Self {
            login: u.login.clone(),
            name: u.name.clone(),
            role: u.role.clone(),
            created_at: u.created_at.clone(),
            avatar_color: u.avatar_color.clone(),
        }
    }
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

fn user_path(root: &Path, login: &str) -> std::path::PathBuf {
    root.join("users").join(format!("{login}.json"))
}

/// Registers a new account. Exclusive create: never overwrites an existing user.
pub fn create(
    root: &Path,
    login: &str,
    password: &str,
    full_name: &str,
    role_id: &str,
) -> Result<UserInfo, AppError> {
    let login = login.trim().to_lowercase();
    if !is_valid_login(&login) {
        return Err(AppError::new(
            "INVALID_INPUT",
            "login must start with a lowercase letter and contain only a-z, 0-9, '.', '_' or '-'",
        ));
    }
    validate_password(password)?;
    let name = full_name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "full name must be between 1 and 120 characters",
        ));
    }
    let role_path = root.join("roles").join(format!("{role_id}.json"));
    if !role_path.exists() {
        return Err(AppError::new("NOT_FOUND", format!("role '{role_id}' does not exist")));
    }

    let user = User {
        login: login.clone(),
        name: name.to_string(),
        password_hash: hash_password(password)?,
        role: role_id.to_string(),
        created_at: now_rfc3339(),
        avatar_color: avatar_color(&login),
    };
    let mut bytes = serde_json::to_vec_pretty(&user)?;
    bytes.push(b'\n');
    fsops::create_exclusive(&user_path(root, &login), &bytes)?;
    Ok(UserInfo::from(&user))
}

/// Creates the first administrator during onboarding.
pub fn create_admin(
    root: &Path,
    login: &str,
    password: &str,
    full_name: &str,
) -> Result<UserInfo, AppError> {
    create(root, login, password, full_name, "admin")
}

pub fn login(root: &Path, login: &str, password: &str) -> Result<UserInfo, AppError> {
    let login = login.trim().to_lowercase();
    let path = user_path(root, &login);
    if !path.exists() {
        return Err(AppError::new("AUTH_FAILED", "invalid login or password"));
    }
    let user: User = fsops::read_json(&path)?;
    if !verify_password(password, &user.password_hash)? {
        return Err(AppError::new("AUTH_FAILED", "invalid login or password"));
    }
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

    #[test]
    fn password_hash_roundtrip() {
        let h = hash_password("s3cret-pass").unwrap();
        assert!(h.starts_with("$argon2"));
        assert!(verify_password("s3cret-pass", &h).unwrap());
        assert!(!verify_password("wrong", &h).unwrap());
    }

    #[test]
    fn create_admin_and_login() {
        let dir = ws();
        let admin = create_admin(dir.path(), "Admin", "password123", "Алексей Ковалёв").unwrap();
        assert_eq!(admin.login, "admin");
        assert_eq!(admin.role, "admin");
        assert_eq!(admin.name, "Алексей Ковалёв");
        assert!(dir.path().join("users").join("admin.json").exists());

        let logged = login(dir.path(), "admin", "password123").unwrap();
        assert_eq!(logged.login, "admin");
    }

    #[test]
    fn login_rejects_bad_password_and_unknown_user() {
        let dir = ws();
        create_admin(dir.path(), "admin", "password123", "Admin").unwrap();
        assert_eq!(login(dir.path(), "admin", "nope").unwrap_err().code, "AUTH_FAILED");
        assert_eq!(login(dir.path(), "ghost", "x").unwrap_err().code, "AUTH_FAILED");
    }

    #[test]
    fn create_is_exclusive_and_validated() {
        let dir = ws();
        create_admin(dir.path(), "admin", "password123", "Admin").unwrap();
        assert_eq!(
            create_admin(dir.path(), "admin", "password123", "Admin").unwrap_err().code,
            "ALREADY_EXISTS"
        );
        assert!(create_admin(dir.path(), "1bad", "password123", "X").is_err());
        assert!(create_admin(dir.path(), "ok", "short", "X").is_err());
        assert!(create_admin(dir.path(), "ok", "password123", "  ").is_err());
        assert!(create(dir.path(), "ok", "password123", "X", "missing_role").is_err());
    }

    #[test]
    fn password_hash_is_not_persisted_in_info() {
        let dir = ws();
        let info = create_admin(dir.path(), "admin", "password123", "Admin").unwrap();
        let raw = std::fs::read_to_string(dir.path().join("users").join("admin.json")).unwrap();
        assert!(raw.contains("passwordHash"));
        assert!(raw.contains("$argon2"));
        let json = serde_json::to_value(&info).unwrap();
        assert!(json.get("passwordHash").is_none());
    }
}