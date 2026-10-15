use std::path::Path;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;
use crate::fsops;
use crate::locking::{self, LockFile};
use crate::permissions;
use crate::roles;
use crate::session::ActorId;
use crate::workspace::{self, WorkspaceConfig};

const MIGRATION_RENEW_INTERVAL: Duration = Duration::from_secs(20);
const MIGRATION_LOCK_KEY: &str = "workspace-migration";

/// Migration lock TTL in seconds. Overridable via `TASKFLOW_MIGRATION_TTL`
/// (default 60) so tests can shrink the expiry window.
fn migration_ttl_sec() -> u64 {
    std::env::var("TASKFLOW_MIGRATION_TTL")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60)
}

/// Migrates a v1 workspace to v2 (users get `id`/`email`/`isActive`/…, roles
/// are whitelisted to the Stage 2 registry). Idempotent: files that already
/// carry v2 markers are skipped, and the config bump (`schemaVersion = 2`) is
/// committed last.
///
/// Returns `Ok(true)` when a migration ran, `Ok(false)` for a no-op.
/// Errors: `SCHEMA_TOO_NEW`, `MIGRATION_LOCKED`, `MIGRATION_LOCK_LOST`, or
/// `MIGRATION_FAILED` (migration did not complete; schema stays 1).
pub fn run(root: &Path, machine_id: &str) -> Result<bool, AppError> {
    run_with_options(root, machine_id, MIGRATION_RENEW_INTERVAL, None)
}

fn run_with_options(
    root: &Path,
    machine_id: &str,
    interval: Duration,
    per_file_delay: Option<Duration>,
) -> Result<bool, AppError> {
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

    let ttl = migration_ttl_sec();
    let lock = locking::acquire(root, MIGRATION_LOCK_KEY, ttl, machine_id)?;
    if !lock.acquired {
        return Err(AppError::new(
            "MIGRATION_LOCKED",
            "workspace migration is already in progress",
        ));
    }
    let token = lock.token.clone().unwrap_or_default();
    let mut heartbeat = LockHeartbeat::new(root, token.clone(), ttl, interval);
    let result = migrate_workspace(root, &mut heartbeat, per_file_delay);
    let _ = locking::release(root, MIGRATION_LOCK_KEY, &token);
    match result {
        Ok(_) => Ok(true),
        Err(e) if e.code == "MIGRATION_LOCK_LOST" => Err(e),
        Err(e) => Err(AppError::with_details(
            "MIGRATION_FAILED",
            "workspace migration failed",
            e.to_string(),
        )),
    }
}

/// Renews the migration lock every `interval` seconds so a long migration does
/// not lose its TTL lock. Renewal failures (lock missing or owned by someone
/// else) abort the migration with `MIGRATION_LOCK_LOST`.
struct LockHeartbeat {
    file: std::path::PathBuf,
    key: String,
    token: String,
    ttl_sec: u64,
    interval: Duration,
    last: Instant,
    renewals: usize,
}

impl LockHeartbeat {
    fn new(root: &Path, token: String, ttl_sec: u64, interval: Duration) -> Self {
        Self {
            file: root.join("locks").join(format!("{MIGRATION_LOCK_KEY}.lock")),
            key: MIGRATION_LOCK_KEY.to_string(),
            token,
            ttl_sec,
            interval,
            last: Instant::now(),
            renewals: 0,
        }
    }

    fn beat(&mut self) -> Result<(), AppError> {
        if self.last.elapsed() < self.interval {
            return Ok(());
        }
        let lock: LockFile = fsops::read_json(&self.file).map_err(|_| {
            AppError::new("MIGRATION_LOCK_LOST", "workspace migration lock was lost")
        })?;
        if lock.token != self.token {
            return Err(AppError::new(
                "MIGRATION_LOCK_LOST",
                "workspace migration lock was lost",
            ));
        }
        let renewed = LockFile {
            key: self.key.clone(),
            owner: lock.owner,
            token: lock.token,
            acquired_at: lock.acquired_at,
            expires_at: (chrono::Utc::now() + chrono::Duration::seconds(self.ttl_sec as i64))
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        };
        fsops::write_json_atomic(&self.file, &renewed)?;
        self.last = Instant::now();
        self.renewals += 1;
        Ok(())
    }
}

fn migrate_workspace(
    root: &Path,
    heartbeat: &mut LockHeartbeat,
    delay: Option<Duration>,
) -> Result<usize, AppError> {
    let users_changed = migrate_users(root, heartbeat, delay)?;
    heartbeat.beat()?;
    let roles_changed = migrate_roles(root, heartbeat, delay)?;
    heartbeat.beat()?;

    let config_path = root.join("config.json");
    let mut cfg: WorkspaceConfig = fsops::read_json(&config_path)?;
    cfg.schema_version = workspace::SCHEMA_VERSION;
    fsops::write_json_atomic(&config_path, &cfg)?;

    let files_changed = users_changed + roles_changed;
    write_migration_event(root, 1, workspace::SCHEMA_VERSION, files_changed)?;
    Ok(files_changed)
}

fn migrate_users(
    root: &Path,
    heartbeat: &mut LockHeartbeat,
    delay: Option<Duration>,
) -> Result<usize, AppError> {
    let dir = root.join("users");
    if !dir.is_dir() {
        return Ok(0);
    }
    let mut count = 0;
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list users", e))? {
        heartbeat.beat()?;
        let entry = entry.map_err(|e| AppError::io("read users dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let v: Value = fsops::read_json(&path)?;
        if v.get("id").is_some() {
            if let Some(d) = delay {
                std::thread::sleep(d);
            }
            continue;
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
        fsops::write_json_atomic(&path, &user)?;
        count += 1;
        if let Some(d) = delay {
            std::thread::sleep(d);
        }
    }
    Ok(count)
}

/// Whitelist rule: system roles are rewritten from the Stage 2 seeds; every
/// other role gets `workspace.manage` → `workspace.settings` and then only
/// registry permissions survive. Roles left with no permissions are marked
/// `empty: true` and audited once (`role.empty_permissions`).
fn migrate_roles(
    root: &Path,
    heartbeat: &mut LockHeartbeat,
    delay: Option<Duration>,
) -> Result<usize, AppError> {
    let seeds = roles::default_roles();
    let mut count = 0;
    for role in roles::list(root)? {
        heartbeat.beat()?;
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
            if custom.permissions.is_empty() {
                custom.empty = true;
                crate::audit::emit(
                    &ActorId::System("migrate"),
                    "role.empty_permissions",
                    "role",
                    &custom.id,
                    serde_json::json!({ "roleId": custom.id }),
                );
            }
            fsops::write_json_atomic(&path, &custom)?;
        }
        count += 1;
        if let Some(d) = delay {
            std::thread::sleep(d);
        }
    }
    Ok(count)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationEvent {
    r#type: String,
    from: u32,
    to: u32,
    files_changed: usize,
    actor: String,
    ts: String,
}

fn write_migration_event(
    root: &Path,
    from: u32,
    to: u32,
    files_changed: usize,
) -> Result<(), AppError> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ").to_string();
    let rel = format!("events/{stamp}-{}.json", uuid::Uuid::new_v4());
    let path = crate::path::resolve_rel(root, &rel)?;
    let event = MigrationEvent {
        r#type: "workspace.migrated".to_string(),
        from,
        to,
        files_changed,
        actor: "s:migrate".to_string(),
        ts: crate::audit::now_rfc3339(),
    };
    fsops::write_json_atomic(&path, &event)
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

    fn migration_events(dir: &Path) -> Vec<Value> {
        let mut events = Vec::new();
        for entry in std::fs::read_dir(dir.join("events")).unwrap() {
            let entry = entry.unwrap();
            let value: Value = fsops::read_json(&entry.path()).unwrap();
            events.push(value);
        }
        events
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

        let events = migration_events(dir.path());
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "workspace.migrated");
        assert_eq!(events[0]["from"], 1);
        assert_eq!(events[0]["to"], 2);
        assert_eq!(events[0]["filesChanged"], 3);
        assert_eq!(events[0]["actor"], "s:migrate");
        assert!(events[0]["ts"].is_string());
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
        assert_eq!(migration_events(dir.path()).len(), 1);
    }

    #[test]
    fn resumes_after_crash_before_config_write() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());

        let mut heartbeat =
            LockHeartbeat::new(dir.path(), "crash-sim".to_string(), 60, Duration::from_secs(20));
        migrate_users(dir.path(), &mut heartbeat, None).unwrap();
        migrate_roles(dir.path(), &mut heartbeat, None).unwrap();
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

    #[test]
    fn slow_migration_renews_the_lock() {
        let old_ttl = std::env::var("TASKFLOW_MIGRATION_TTL").ok();
        std::env::set_var("TASKFLOW_MIGRATION_TTL", "2");

        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        let ttl = migration_ttl_sec();
        let lock = locking::acquire(dir.path(), MIGRATION_LOCK_KEY, ttl, "m1").unwrap();
        assert!(lock.acquired);
        let token = lock.token.unwrap();
        let mut heartbeat = LockHeartbeat::new(
            dir.path(),
            token.clone(),
            ttl,
            Duration::from_millis(400),
        );

        // 3 files x 500ms delay; the 400ms heartbeat renews before each one.
        migrate_workspace(dir.path(), &mut heartbeat, Some(Duration::from_millis(500))).unwrap();

        assert!(heartbeat.renewals >= 2);
        assert_eq!(config_schema(dir.path()), 2);
        let _ = locking::release(dir.path(), MIGRATION_LOCK_KEY, &token);

        match old_ttl {
            Some(v) => std::env::set_var("TASKFLOW_MIGRATION_TTL", v),
            None => std::env::remove_var("TASKFLOW_MIGRATION_TTL"),
        }
    }

    #[test]
    fn heartbeat_detects_lock_loss() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        let ttl = migration_ttl_sec();
        let lock = locking::acquire(dir.path(), MIGRATION_LOCK_KEY, ttl, "m1").unwrap();
        let token = lock.token.unwrap();
        let mut heartbeat = LockHeartbeat::new(dir.path(), token.clone(), ttl, Duration::from_millis(10));

        std::thread::sleep(Duration::from_millis(15));
        std::fs::remove_file(dir.path().join("locks").join("workspace-migration.lock")).unwrap();
        let err = heartbeat.beat().unwrap_err();
        assert_eq!(err.code, "MIGRATION_LOCK_LOST");
        let _ = locking::release(dir.path(), MIGRATION_LOCK_KEY, &token);
    }

    #[test]
    fn role_with_only_unknown_permissions_becomes_empty() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        let custom = serde_json::json!({
            "id": "custom",
            "name": "Custom",
            "description": "",
            "permissions": ["custom.perm", "attachments.add"],
            "isSystem": false,
            "color": "#123456",
        });
        fsops::write_json_atomic(&dir.path().join("roles").join("custom.json"), &custom).unwrap();

        assert!(run(dir.path(), "m1").unwrap());

        let custom: Value =
            fsops::read_json(&dir.path().join("roles").join("custom.json")).unwrap();
        assert_eq!(
            custom["permissions"].as_array().unwrap().len(),
            0,
            "all-unknown permissions are dropped"
        );
        assert_eq!(custom["empty"], true);
    }

    #[test]
    fn migration_failure_leaves_schema_at_one() {
        let dir = tempdir().unwrap();
        write_v1_workspace(dir.path());
        std::fs::write(dir.path().join("users").join("admin.json"), "{ not json").unwrap();
        let err = run(dir.path(), "m1").unwrap_err();
        assert_eq!(err.code, "MIGRATION_FAILED");
        assert_eq!(config_schema(dir.path()), 1);
    }
}
