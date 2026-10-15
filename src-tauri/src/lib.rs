mod audit;
mod commands;
mod error;
mod fsops;
mod identity;
mod locking;
mod logging;
mod path;
mod permissions;
mod roles;
mod session;
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

    /// `AUTH_REQUIRED` + the session's role must grant `perm`. On a missing
    /// role file, emits `role.missing` and returns `ROLE_NOT_FOUND`.
    #[allow(dead_code)]
    pub fn require_perm(&self, perm: &str) -> Result<Session, AppError> {
        let session = self.require_auth()?;
        let root = self.root()?;
        match roles::permissions_for(&root, &session.role_id) {
            Ok(perms) => {
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
                audit::emit(
                    &session::ActorId::User(session.user_id.clone()).label(),
                    "role.missing",
                    "role",
                    &session.role_id,
                    serde_json::json!({
                        "userId": session.user_id,
                        "roleId": session.role_id,
                    }),
                );
                Err(e)
            }
            Err(e) => Err(e),
        }
    }

    /// `AUTH_REQUIRED` + the session must not be forced to change its
    /// password (`PASSWORD_CHANGE_REQUIRED`).
    #[allow(dead_code)]
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
            commands::login,
            commands::logout,
            commands::get_session,
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

    fn session_for(user_id: &str, role_id: &str, must_change: bool) -> Session {
        Session {
            user_id: user_id.to_string(),
            login: "login".to_string(),
            display_name: "Name".to_string(),
            role_id: role_id.to_string(),
            avatar_color: "#5b5bd6".to_string(),
            must_change_password: must_change,
            login_at: "2026-10-15T00:00:00Z".to_string(),
        }
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
}
