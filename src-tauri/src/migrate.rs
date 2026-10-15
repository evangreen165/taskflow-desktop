use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;
use crate::fsops;
use crate::locking;
use crate::permissions;
use crate::roles;
use crate::workspace::{self, WorkspaceConfig};

/// Migrates a v1 workspace to v2 (users get `id`/`email`/`isActive`/…, roles
/// are whitelisted to the Stage 2 registry). Idempotent: files that already
/// carry v2 markers are skipped, and the config bump (`schemaVersion = 2`) is
/// committed last.
///
/// Returns `Ok(true)` when a migration ran, `Ok(false)` for a no-op.
pub fn run(root: &Path, machine_id: &str) -> Result<bool, AppError> {
    let config_path = root.join("config.json");
    let cfg: WorkspaceConfig = fsops::read_json(&config_path)?;
    if cfg.schema_version > workspace::SCHEMA_VERSION {
        return Err(AppError::new(
            "SCHEMA_TOO_NEW",
            format!(
                "workspace schema v{} is newer than this app supports (v{})",
                cfg.schema_version, workspace::SCHEMA_VERSION
            ),
        ));
    }
    if cfg.schema_version >= 2 {
        return Ok(false);
    }

    let lock = locking::acquire(root, "workspace-migration", 60, machine_id)?;
    if !lock.acquired {
        return Err(AppError::new(
            "MIGRATION_LOCKED",
            "workspace migration is already in progress",
        ));
    }
    let token = lock.token.clone().unwrap_or_default();
    let result = migrate_workspace(root);
    let _ = locking::release(root, "workspace-migration", &token);
    result.map(|_| true)
}

fn migrate_workspace(root: &Path) -> Result<(), AppError> {
    migrate_users(root)?;
    migrate_roles(root)?;
    let config_path = root.join("config.json");
    let mut cfg: WorkspaceConfig = fsops::read_json(&config_path)?;
    cfg.schema_version = workspace::SCHEMA_VERSION;
    fsops::write_json_atomic(&config_path, &cfg)?;
    Ok(())
}

fn migrate_users(root: &Path) -> Result<(), AppError> {
    let dir = root.join("users");
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list users", e))? {
        let entry = entry.map_err(|e| AppError::io("read users dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        migrate_user_file(&path)?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigratedUser {
    id: String,
    login: String,
    display_name: String,
    email: Option<String>,
    password_hash: String,
    role_id: String,
    avatar_color: String,
    created_at: String,
    last_login_at: Option<String>,
    is_active: bool,
    must_change_password: bool,
}

fn get_str(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// Converts one v1 user file; files that already carry an `id` are left alone.
fn migrate_user_file(path: &Path) -> Result<(), AppError> {
    let v: Value = fsops::read_json(path)?;
    if v.get("id").is_some() {
        return Ok(());
    }
    let user = MigratedUser {
        id: uuid::Uuid::new_v4().to_string(),
        login: get_str(&v, "login"),
        display_name: get_str(&v, "name"),
        email: None,
        password_hash: get_str(&v, "passwordHash"),
        role_id: get_str(&v, "role"),
        avatar_color: get_str(&v, "avatarColor"),
        created_at: get_str(&v, "createdAt"),
        last_login_at: None,
        is_active: true,
        must_change_password: false,
    };
    fsops::write_json_atomic(path, &user)
}

/// Whitelist rule: system roles are rewritten from the Stage 2 seeds; every
/// other role gets `workspace.manage` → `workspace.settings` and then only
/// registry permissions survive.
fn migrate_roles(root: &Path) -> Result<(), AppError> {
    let seeds = roles::default_roles();
    for role in roles::list(root)? {
        let path = root.join("roles").join(format!("{}.json", role.id));
        if let Some(seed) = seeds.iter().find(|s| s.id == role.id) {
            fsops::write_json_atomic(&path, seed)?;
        } else {
            let mut custom = role;
            custom.permissions = permissions::filter_valid(custom.permissions.into_iter().map(
                |p| {
                    if p == "workspace.manage" {
                        "workspace.settings".to_string()
                    } else {
                        p
                    }
                },
            ));
            fsops::write_json_atomic(&path, &custom)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;
    use tempfile::tempdir;

    fn write_v1_workspace(dir: &Path) {
        for d in workspace::WORKSPACE_DIRS {
            std::fs::create_dir_all(dir.join(d)).unwrap();
        }
        let cfg = serde_json::json!({
            "schemaVersion": 1,
            "workspaceId": "w1",
            "name": "V1",
            "createdAt": "2026-10-01T00:00:00.000Z",
        });
        fsops::write_json_atomic(&dir.join("config.json"), &cfg).unwrap();

        let admin = serde_json::json!({
            "login": "admin",
            "name": "Алексей Ковалёв",
            "passwordHash": "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$cGFzcw",
            "role": "admin",
            "createdAt": "2026-10-01T00:00:00.000Z",
            "avatarColor": "#5b5bd6",
        });
        fsops::write_json_atomic(&dir.join("users").join("admin.json"), &admin).unwrap();

        let admin_role = serde_json::json!({
            "id": "admin",
            "name": "Администратор",
            "description": "Полный доступ",
            "permissions": [
                "task.view", "task.create", "task.edit", "task.change_status",
                "task.assign", "task.view_all", "task.delete", "article.view",
                "article.create", "article.edit", "article.publish", "article.delete",
                "attachments.add", "users.manage", "roles.manage", "audit.view",
                "workspace.manage"
            ],
            "isSystem": true,
            "color": "#5b5bd6",
        });
        fsops::write_json_atomic(&dir.join("roles").join("admin.json"), &admin_role).unwrap();

        let custom_role = serde_json::json!({
            "id": "custom",
            "name": "Custom",
            "description": "",
            "permissions": ["task.view", "custom.perm", "attachments.add", "workspace.manage"],
            "isSystem": false,
            "color": "#123456",
        });
        fsops::write_json_atomic(&dir.join("roles").join("custom.json"), &custom_role).unwrap();
    }

    fn config_schema(dir: &Path) -> u32 {
        let cfg: WorkspaceConfig = fsops::read_json(&dir.join("config.json")).unwrap();
        cfg.schema_version
    }

    #[test]
    fn migrates_v1_workspace_to_v2() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());

        assert!(run(dir.path(), "m1").unwrap());

        assert_eq!(config_schema(dir.path()), 2);

        let admin: Value = fsops::read_json(&dir.path().join("users").join("admin.json")).unwrap();
        assert!(admin.get("id").is_some());
        assert_eq!(admin["displayName"], "Алексей Ковалёв");
        assert_eq!(admin["roleId"], "admin");
        assert!(admin.get("name").is_none());
        assert!(admin.get("role").is_none());
        assert!(admin.get("passwordSalt").is_none());
        assert_eq!(admin["passwordHash"], "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$cGFzcw");
        assert_eq!(admin["isActive"], true);

        let admin_role: Value =
            fsops::read_json(&dir.path().join("roles").join("admin.json")).unwrap();
        let perms: Vec<&str> = admin_role["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap())
            .collect();
        assert!(perms.contains(&"workspace.settings"));
        assert!(!perms.contains(&"workspace.manage"));
        assert!(!perms.contains(&"attachments.add"));

        let custom: Value =
            fsops::read_json(&dir.path().join("roles").join("custom.json")).unwrap();
        let custom_perms: Vec<&str> = custom["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap())
            .collect();
        assert_eq!(custom_perms, vec!["task.view", "workspace.settings"]);
    }

    #[test]
    fn second_run_is_a_noop_and_leaves_files_untouched() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        assert!(run(dir.path(), "m1").unwrap());
        let files = [
            "config.json",
            "users/admin.json",
            "roles/admin.json",
            "roles/custom.json",
        ];
        let mtimes: Vec<_> = files
            .iter()
            .map(|f| {
                std::fs::metadata(dir.path().join(f))
                    .unwrap()
                    .modified()
                    .unwrap()
            })
            .collect();

        assert!(!run(dir.path(), "m1").unwrap());
        assert_eq!(config_schema(dir.path()), 2);

        for (f, before) in files.iter().zip(mtimes) {
            let after = std::fs::metadata(dir.path().join(f))
                .unwrap()
                .modified()
                .unwrap();
            assert_eq!(after, before, "file {f} must not be rewritten");
        }
    }

    #[test]
    fn resumes_after_crash_before_config_write() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());

        migrate_users(dir.path()).unwrap();
        migrate_roles(dir.path()).unwrap();
        assert_eq!(config_schema(dir.path()), 1);

        assert!(run(dir.path(), "m1").unwrap());
        assert_eq!(config_schema(dir.path()), 2);
        let admin: Value = fsops::read_json(&dir.path().join("users").join("admin.json")).unwrap();
        assert!(admin.get("id").is_some());
    }

    #[test]
    fn refuses_schema_newer_than_supported() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        let mut cfg: WorkspaceConfig = fsops::read_json(&dir.path().join("config.json")).unwrap();
        cfg.schema_version = 3;
        fsops::write_json_atomic(&dir.path().join("config.json"), &cfg).unwrap();
        let err = run(dir.path(), "m1").unwrap_err();
        assert_eq!(err.code, "SCHEMA_TOO_NEW");
    }

    #[test]
    fn migration_invalidates_an_active_session() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());

        let state = AppState::new("m1".into());
        state.set_session(crate::session::Session {
            user_id: "u1".to_string(),
            login: "admin".to_string(),
            display_name: "A".to_string(),
            role_id: "admin".to_string(),
            avatar_color: "#5b5bd6".to_string(),
            must_change_password: false,
            login_at: "2026-10-15T00:00:00Z".to_string(),
            role_missing_reported: false,
        });

        let err = crate::commands::activate_workspace_impl(&state, dir.path().to_path_buf())
            .unwrap_err();
        assert_eq!(err.code, "SESSION_INVALIDATED");
        assert!(state.require_auth().is_err());
        assert_eq!(config_schema(dir.path()), 2);
    }
}
