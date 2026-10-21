mod audit;
mod attachments;
mod commands;
mod error;
mod fsops;
mod identity;
mod locking;
mod logging;
mod migrate;
mod notes;
mod path;
mod permissions;
mod roles;
mod session;
mod spaces;
mod tasks;
mod users;
mod watcher;
mod workspace;

pub use error::AppError;
pub use session::{Session, SessionView};
pub use users::UserInfo;
pub use workspace::WorkspaceInfo;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use tauri::Manager;

pub struct StateData {
    workspace: Option<(PathBuf, WorkspaceInfo)>,
    session: Option<Session>,
    watcher: Option<watcher::WorkspaceWatcher>,
    machine_id: String,
}

/// Shared application state managed by Tauri.
pub struct AppState {
    inner: Mutex<StateData>,
    /// Workspace root shared with the tracing `AuditLayer`.
    audit_root: Arc<RwLock<Option<PathBuf>>>,
}

impl AppState {
    pub fn new(machine_id: String) -> Self {
        Self {
            inner: Mutex::new(StateData {
                workspace: None,
                session: None,
                watcher: None,
                machine_id,
            }),
            audit_root: Arc::new(RwLock::new(None)),
        }
    }

    pub fn machine_id(&self) -> String {
        self.inner.lock().machine_id.clone()
    }

    pub fn root(&self) -> Result<PathBuf, AppError> {
        self.inner
            .lock()
            .workspace
            .as_ref()
            .map(|(root, _)| root.clone())
            .ok_or_else(|| AppError::new("NO_WORKSPACE", "no workspace is activated"))
    }

    pub fn set_workspace(&self, root: PathBuf, info: WorkspaceInfo) {
        {
            let mut guard = self.inner.lock();
            guard.workspace = Some((root.clone(), info));
            // A workspace switch invalidates the previous watcher and session.
            guard.watcher = None;
            guard.session = None;
        }
        *self.audit_root.write() = Some(root);
    }

    pub fn set_session(&self, session: Session) {
        self.inner.lock().session = Some(session);
    }

    pub fn clear_session(&self) {
        self.inner.lock().session = None;
    }

    /// Actor for the audit trail: the logged-in user id, or `s:anonymous`.
    pub fn actor(&self) -> session::ActorId {
        match self.inner.lock().session.as_ref() {
            Some(s) => session::ActorId::User(s.user_id.clone()),
            None => session::ActorId::System("anonymous"),
        }
    }

    /// `AUTH_REQUIRED` when no session is active.
    pub fn require_auth(&self) -> Result<Session, AppError> {
        self.inner
            .lock()
            .session
            .clone()
            .ok_or_else(|| AppError::new("AUTH_REQUIRED", "authentication required"))
    }

    /// Full session view: sanitized user, resolved role, effective
    /// permissions. A missing role file is `ROLE_NOT_FOUND` (deny).
    pub fn session(&self) -> Result<SessionView, AppError> {
        let session = self.require_auth()?;
        let root = self.root()?;
        session::view(&root, &session)
    }

    /// `AUTH_REQUIRED` + the session's role must grant `perm`. A missing role
    /// file emits `role.missing` (at most once per session) and returns
    /// `ROLE_NOT_FOUND`; an empty role returns `ROLE_EMPTY`.
    pub fn require_perm(&self, perm: &str) -> Result<Session, AppError> {
        let session = self.require_auth()?;
        let root = self.root()?;
        match roles::get(&root, &session.role_id) {
            Ok(role) => {
                if role.empty {
                    return Err(AppError::new(
                        "ROLE_EMPTY",
                        format!("role '{}' has no permissions", role.id),
                    ));
                }
                let perms = roles::permissions_for(&root, &session.role_id)?;
                if perms.iter().any(|p| p == perm) {
                    Ok(session)
                } else {
                    Err(AppError::new(
                        "FORBIDDEN",
                        format!("permission '{perm}' is required"),
                    ))
                }
            }
            Err(e) if e.code == "ROLE_NOT_FOUND" => {
                if !session.role_missing_reported {
                    audit::emit(
                        &session::ActorId::User(session.user_id.clone()),
                        "role.missing",
                        "role",
                        &session.role_id,
                        serde_json::json!({
                            "userId": session.user_id,
                            "roleId": session.role_id,
                        }),
                    );
                    if let Some(active) = self.inner.lock().session.as_mut() {
                        active.role_missing_reported = true;
                    }
                }
                Err(e)
            }
            Err(e) => Err(e),
        }
    }

    /// `AUTH_REQUIRED` + the session must not be forced to change its
    /// password (`PASSWORD_CHANGE_REQUIRED`).
    pub fn require_writable(&self) -> Result<Session, AppError> {
        let session = self.require_auth()?;
        if session.must_change_password {
            return Err(AppError::new(
                "PASSWORD_CHANGE_REQUIRED",
                "password change is required before writing",
            ));
        }
        Ok(session)
    }

    pub fn ensure_watcher(
        &self,
        app: &tauri::AppHandle,
        sub_path: Option<&str>,
    ) -> Result<(), AppError> {
        let mut guard = self.inner.lock();
        if guard.watcher.is_some() {
            return Ok(());
        }
        let root = guard
            .workspace
            .as_ref()
            .map(|(root, _)| root.clone())
            .ok_or_else(|| AppError::new("NO_WORKSPACE", "no workspace is activated"))?;
        let target = match sub_path {
            Some(path) if !path.is_empty() && path != "." => {
                crate::path::resolve_rel(&root, path)?
            }
            _ => root,
        };
        let started = watcher::start(&target, app.clone())?;
        guard.watcher = Some(started);
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let machine_id = identity::load_or_create(&app_data_dir)
                .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
            let state = AppState::new(machine_id);
            let audit_layer = audit::AuditLayer::new(state.audit_root.clone());
            if let Err(err) = logging::init(&app_data_dir, audit_layer) {
                eprintln!("logging init failed: {err}");
            }
            tracing::info!(target: "taskflow", "TaskFlow started");

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::init_workspace,
            commands::activate_workspace,
            commands::inspect_folder,
            commands::create_admin,
            commands::auth_login,
            commands::auth_logout,
            commands::auth_change_password,
            commands::auth_register,
            commands::auth_reset_password,
            commands::auth_refresh_session,
            commands::users_list,
            commands::users_update,
            commands::users_deactivate,
            commands::users_summaries,
            commands::users_directory,
            commands::roles_list,
            commands::roles_create,
            commands::roles_update,
            commands::roles_delete,
            commands::permissions_list,
            commands::tasks_list,
            commands::tasks_get,
            commands::tasks_create,
            commands::tasks_update,
            commands::tasks_change_status,
            commands::tasks_delete,
            commands::tasks_move,
            commands::notes_list,
            commands::notes_get,
            commands::notes_get_history,
            commands::notes_create,
            commands::notes_update,
            commands::notes_publish,
            commands::notes_delete,
            commands::notes_restore_version,
            commands::notes_share,
            commands::notes_list_categories,
            commands::notes_create_category,
            commands::notes_delete_category,
            commands::notes_import,
            commands::attachment_add,
            commands::attachment_get_base64,
            commands::attachment_remove,
            commands::attachment_open,
            commands::dashboard_summary,
            commands::spaces_list,
            commands::spaces_get,
            commands::spaces_create,
            commands::spaces_update,
            commands::spaces_delete,
            commands::read_json,
            commands::write_json_atomic,
            commands::read_text,
            commands::write_text_atomic,
            commands::create_exclusive,
            commands::remove_path,
            commands::exists,
            commands::list_dir,
            commands::hash_file,
            commands::acquire_lock,
            commands::release_lock,
            commands::is_locked,
            commands::watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::users;
    use crate::workspace;
    use tempfile::tempdir;
    use tracing::Dispatch;
    use tracing_subscriber::{layer::SubscriberExt, registry::Registry};

    fn session_for(user_id: &str, role_id: &str, must_change: bool) -> Session {
        Session {
            user_id: user_id.to_string(),
            login: "login".to_string(),
            display_name: "Name".to_string(),
            role_id: role_id.to_string(),
            avatar_color: "#5b5bd6".to_string(),
            must_change_password: must_change,
            login_at: "2026-10-15T00:00:00Z".to_string(),
            role_missing_reported: false,
        }
    }

    fn install_audit_layer(state: &AppState) -> tracing::dispatcher::DefaultGuard {
        let layer = audit::AuditLayer::new(state.audit_root.clone());
        let dispatch = Dispatch::new(Registry::default().with(layer));
        tracing::dispatcher::set_default(&dispatch)
    }

    fn last_audit_line(root: &std::path::Path) -> serde_json::Value {
        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content = std::fs::read_to_string(root.join("audit").join(format!("{month}.log")))
            .expect("audit log exists");
        let lines: Vec<&str> = content.lines().collect();
        serde_json::from_str(lines.last().expect("has lines")).unwrap()
    }

    #[test]
    fn guards_require_auth_first() {
        let state = AppState::new("m".into());
        assert_eq!(state.require_auth().unwrap_err().code, "AUTH_REQUIRED");
        assert_eq!(state.require_perm("task.view").unwrap_err().code, "AUTH_REQUIRED");
        assert_eq!(state.require_writable().unwrap_err().code, "AUTH_REQUIRED");
        assert_eq!(state.session().unwrap_err().code, "AUTH_REQUIRED");
        assert_eq!(state.actor().label(), "s:anonymous");
    }

    #[test]
    fn guards_enforce_permissions_and_role_lookup() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Guards").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "E", "executor", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        state.set_session(session_for(&admin.id, "admin", false));
        assert!(state.require_perm("task.create").is_ok());
        assert!(state.require_perm("users.manage").is_ok());
        assert_eq!(state.actor().label(), format!("u:{}", admin.id));

        state.set_session(session_for(&executor.id, "executor", false));
        let err = state.require_perm("task.create").unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
        assert!(err.message.contains("task.create"));
        assert!(state.require_perm("task.view").is_ok());

        let view = state.session().unwrap();
        assert_eq!(view.role.id, "executor");
        assert_eq!(view.role.name, "Исполнитель");
        assert!(view.permissions.contains(&"task.view".to_string()));
        assert!(!view.permissions.contains(&"task.create".to_string()));
    }

    #[test]
    fn missing_role_denies_never_grants() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "MissingRole").unwrap();
        let user = users::create(dir.path(), "ex", "password123", "E", "observer", None).unwrap();
        std::fs::remove_file(dir.path().join("roles").join("observer.json")).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "observer", false));
        assert_eq!(state.require_perm("task.view").unwrap_err().code, "ROLE_NOT_FOUND");
        assert_eq!(state.session().unwrap_err().code, "ROLE_NOT_FOUND");
    }

    #[test]
    fn writable_rejects_forced_password_change() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Forced").unwrap();
        let user = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "admin", true));
        let err = state.require_writable().unwrap_err();
        assert_eq!(err.code, "PASSWORD_CHANGE_REQUIRED");
        assert!(state.require_auth().is_ok());

        state.set_session(session_for(&user.id, "admin", false));
        assert!(state.require_writable().is_ok());
    }

    #[test]
    fn role_missing_is_deduplicated_per_session() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Dedup").unwrap();
        let user = users::create(dir.path(), "ex", "password123", "E", "observer", None).unwrap();
        std::fs::remove_file(dir.path().join("roles").join("observer.json")).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "observer", false));
        let _guard = install_audit_layer(&state);

        for _ in 0..5 {
            assert_eq!(
                state.require_perm("task.view").unwrap_err().code,
                "ROLE_NOT_FOUND"
            );
        }
        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content =
            std::fs::read_to_string(dir.path().join("audit").join(format!("{month}.log"))).unwrap();
        let count = content.lines().filter(|l| l.contains("role.missing")).count();
        assert_eq!(count, 1);
    }

    #[test]
    fn init_workspace_audits_system_actor_reason() {
        let dir = tempdir().unwrap();
        let state = AppState::new("m".into());
        let _guard = install_audit_layer(&state);
        crate::commands::init_workspace_impl(&state, dir.path().to_path_buf(), "Init WS").unwrap();
        let line = last_audit_line(dir.path());
        assert_eq!(line["userId"], "s:init");
        assert_eq!(line["action"], "workspace.create");
        assert_ne!(line["userId"], "s:anonymous");
    }

    #[test]
    fn logout_audits_the_logged_in_user_not_anonymous() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Logout").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        let _guard = install_audit_layer(&state);

        crate::commands::login_impl(&state, "admin", "password123").unwrap();
        crate::commands::logout_impl(&state);

        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content =
            std::fs::read_to_string(dir.path().join("audit").join(format!("{month}.log"))).unwrap();
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["action"], "auth.login");
        assert_eq!(lines[0]["userId"], format!("u:{}", admin.id));
        assert_eq!(lines[1]["action"], "auth.logout");
        assert_eq!(lines[1]["userId"], format!("u:{}", admin.id));
        assert_ne!(lines[1]["userId"], "s:anonymous");
    }

    #[test]
    fn empty_role_returns_role_empty_not_forbidden() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "EmptyRole").unwrap();
        let role =
            crate::roles::create(dir.path(), "nodata", "No Data", "", "#000000", vec!["custom.perm".to_string()])
                .unwrap();
        assert!(role.empty);
        assert!(serde_json::to_string(&role).unwrap().contains("\"empty\":true"));
        assert!(
            !serde_json::to_string(&crate::roles::default_roles()[0])
                .unwrap()
                .contains("\"empty\"")
        );
        let user = users::create(dir.path(), "u1", "password123", "U", "nodata", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "nodata", false));
        assert_eq!(state.require_perm("task.view").unwrap_err().code, "ROLE_EMPTY");
        assert_eq!(state.require_perm("users.manage").unwrap_err().code, "ROLE_EMPTY");
    }

    #[test]
    fn write_commands_block_must_change_password() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "WriteGuard").unwrap();
        let user = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "admin", true));

        macro_rules! expect_pw {
            ($name:literal, $expr:expr) => {{
                let result = $expr;
                assert_eq!(
                    result.unwrap_err().code,
                    "PASSWORD_CHANGE_REQUIRED",
                    "{} must be blocked for mustChangePassword sessions",
                    $name
                );
            }};
        }

        expect_pw!("writeJsonAtomic", crate::commands::write_json_atomic_impl(
            &state, "a.json".to_string(), serde_json::Value::Null
        ));
        expect_pw!("writeTextAtomic", crate::commands::write_text_atomic_impl(
            &state, "a.txt".to_string(), "x".to_string()
        ));
        expect_pw!("createExclusive", crate::commands::create_exclusive_impl(
            &state, "a.json".to_string()
        ));
        expect_pw!("removePath", crate::commands::remove_path_impl(
            &state, "a.json".to_string()
        ));
        expect_pw!("usersUpdate", crate::commands::users_update_impl(
            &state, "u1".to_string(), crate::users::UserPatch::default()
        ));
        expect_pw!("usersDeactivate", crate::commands::users_deactivate_impl(
            &state, "u1".to_string()
        ));
        expect_pw!("authResetPassword", crate::commands::auth_reset_password_impl(
            &state, "u1".to_string(), "newpass1".to_string()
        ));
        expect_pw!("authRegister", crate::commands::auth_register_impl(
            &state,
            "u2".to_string(),
            "password123".to_string(),
            "N".to_string(),
            "observer".to_string(),
            None,
        ));
        expect_pw!("rolesCreate", crate::commands::roles_create_impl(
            &state, "r1".to_string(), "R".to_string(), "".to_string(), "#000000".to_string(), vec![]
        ));
        expect_pw!("rolesUpdate", crate::commands::roles_update_impl(
            &state, "r1".to_string(), crate::roles::RolePatch::default()
        ));
        expect_pw!("rolesDelete", crate::commands::roles_delete_impl(
            &state, "r1".to_string()
        ));
    }

    #[test]
    fn must_change_password_can_lock_but_not_write() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "LockGuard").unwrap();
        let user = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user.id, "admin", true));

        let lock = crate::commands::acquire_lock_impl(&state, "task-T-9".to_string(), 60).unwrap();
        assert!(lock.acquired);
        let token = lock.token.unwrap();
        assert!(
            crate::commands::release_lock_impl(&state, "task-T-9".to_string(), token).is_ok()
        );

        let err = crate::commands::write_json_atomic_impl(
            &state,
            "x.json".to_string(),
            serde_json::Value::Null,
        )
        .unwrap_err();
        assert_eq!(err.code, "PASSWORD_CHANGE_REQUIRED");
    }

    #[test]
    fn read_commands_require_auth_and_block_sensitive_paths() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "ReadGuard").unwrap();
        users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "E", "executor", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        assert_eq!(
            crate::commands::read_json_impl(&state, "users/admin.json".to_string())
                .unwrap_err()
                .code,
            "AUTH_REQUIRED"
        );

        state.set_session(session_for(&executor.id, "executor", false));
        assert_eq!(
            crate::commands::read_json_impl(&state, "users/admin.json".to_string())
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
        assert_eq!(
            crate::commands::read_json_impl(&state, "roles/admin.json".to_string())
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
        assert_eq!(
            crate::commands::read_json_impl(&state, "audit/2026-10.log".to_string())
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
        assert_eq!(
            crate::commands::list_dir_impl(&state, "users".to_string(), None)
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );

        std::fs::create_dir_all(dir.path().join("tasks")).unwrap();
        fsops::write_json_atomic(
            &dir.path().join("tasks").join("abc.json"),
            &serde_json::json!({ "x": 1 }),
        )
        .unwrap();
        let value =
            crate::commands::read_json_impl(&state, "tasks/abc.json".to_string()).unwrap();
        assert_eq!(value["x"], 1);
    }

    #[test]
    fn last_active_admin_guard_in_commands() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "LastAdmin").unwrap();
        let only = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&only.id, "admin", false));

        let err = crate::commands::users_deactivate_impl(&state, only.id.clone()).unwrap_err();
        assert_eq!(err.code, "LAST_ADMIN");

        let err = crate::commands::users_update_impl(
            &state,
            only.id.clone(),
            crate::users::UserPatch {
                role_id: Some("observer".to_string()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert_eq!(err.code, "LAST_ADMIN");

        let err = crate::commands::users_update_impl(
            &state,
            only.id.clone(),
            crate::users::UserPatch {
                is_active: Some(false),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert_eq!(err.code, "LAST_ADMIN");

        // second admin: deactivating the first succeeds
        let second = users::create(
            dir.path(),
            "admin2",
            "password123",
            "Second",
            "admin",
            None,
        )
        .unwrap();
        let deactivated =
            crate::commands::users_deactivate_impl(&state, only.id.clone()).unwrap();
        assert!(!deactivated.is_active);
        assert!(second.is_active);
    }

    #[test]
    fn write_commands_block_sensitive_paths() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "WritePath").unwrap();
        let admin = users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "E", "executor", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        // anonymous write into a sensitive path still reports AUTH_REQUIRED
        assert_eq!(
            crate::commands::write_json_atomic_impl(
                &state,
                "users/executor.json".to_string(),
                serde_json::Value::Null,
            )
            .unwrap_err()
            .code,
            "AUTH_REQUIRED"
        );

        state.set_session(session_for(&executor.id, "executor", false));

        let pw = "FORBIDDEN_PATH";
        assert_eq!(
            crate::commands::write_json_atomic_impl(
                &state,
                "users/executor.json".to_string(),
                serde_json::json!({ "roleId": "admin" }),
            )
            .unwrap_err()
            .code,
            pw
        );
        assert_eq!(
            crate::commands::write_json_atomic_impl(
                &state,
                "config.json".to_string(),
                serde_json::Value::Null,
            )
            .unwrap_err()
            .code,
            pw
        );
        assert_eq!(
            crate::commands::write_text_atomic_impl(
                &state,
                "roles/x.json".to_string(),
                "x".to_string(),
            )
            .unwrap_err()
            .code,
            pw
        );
        assert_eq!(
            crate::commands::create_exclusive_impl(&state, "users/new.json".to_string())
                .unwrap_err()
                .code,
            pw
        );
        assert_eq!(
            crate::commands::remove_path_impl(&state, "users/admin.json".to_string())
                .unwrap_err()
                .code,
            pw
        );
        assert_eq!(
            crate::commands::exists_impl(&state, "users/admin.json".to_string())
                .unwrap_err()
                .code,
            pw
        );
        assert_eq!(
            crate::commands::hash_file_impl(&state, "users/admin.json".to_string())
                .unwrap_err()
                .code,
            pw
        );

        // admins are blocked from generic storage too
        state.set_session(session_for(&admin.id, "admin", false));
        assert_eq!(
            crate::commands::write_json_atomic_impl(
                &state,
                "users/admin.json".to_string(),
                serde_json::Value::Null,
            )
            .unwrap_err()
            .code,
            pw
        );

        // legitimate generic write still works
        std::fs::create_dir_all(dir.path().join("tasks")).unwrap();
        crate::commands::write_json_atomic_impl(
            &state,
            "tasks/abc.json".to_string(),
            serde_json::json!({ "x": 1 }),
        )
        .unwrap();
        let written: serde_json::Value =
            crate::fsops::read_json(&dir.path().join("tasks").join("abc.json")).unwrap();
        assert_eq!(written["x"], 1);

        // typed command path still works for admins
        let target =
            users::create(dir.path(), "bob", "password123", "Bob", "observer", None).unwrap();
        let updated = crate::commands::users_update_impl(
            &state,
            target.id.clone(),
            crate::users::UserPatch {
                display_name: Some("Боб".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.display_name, "Боб");
        assert_eq!(
            crate::fsops::read_json::<serde_json::Value>(&dir.path().join("users").join("bob.json"))
                .unwrap()["displayName"],
            "Боб"
        );
    }

    #[test]
    fn login_failed_hashes_the_login() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "LoginFail").unwrap();
        users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        let _guard = install_audit_layer(&state);

        let err = crate::commands::auth_login_impl(&state, "Admin", "wrong-password").unwrap_err();
        assert_eq!(err.code, "AUTH_FAILED");

        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content =
            std::fs::read_to_string(dir.path().join("audit").join(format!("{month}.log"))).unwrap();
        let line: serde_json::Value =
            serde_json::from_str(content.lines().last().unwrap()).unwrap();
        assert_eq!(line["action"], "auth.login_failed");
        assert_eq!(line["userId"], "s:anonymous");
        let hash = line["meta"]["loginHash"].as_str().unwrap();
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"admin");
        assert_eq!(hash, hex::encode(hasher.finalize()));
        assert!(!content.contains("Admin"));
        assert!(!content.contains("wrong-password"));
    }

    #[test]
    fn audit_output_never_leaks_credentials() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "NoLeak").unwrap();
        users::create(dir.path(), "admin", "password123", "A", "admin", None).unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        let _guard = install_audit_layer(&state);

        crate::commands::login_impl(&state, "admin", "password123").unwrap();
        let _ = crate::commands::auth_change_password_impl(&state, "password123", "new-password-1");
        let _ = crate::commands::auth_login_impl(&state, "admin", "wrong-pass");

        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content =
            std::fs::read_to_string(dir.path().join("audit").join(format!("{month}.log"))).unwrap();
        assert!(!content.contains("passwordHash"));
        assert!(!content.contains("passwordSalt"));
        assert!(!content.contains("password123"));
        assert!(!content.contains("new-password-1"));
        assert!(!content.contains("wrong-pass"));
    }
}
