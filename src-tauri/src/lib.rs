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
mod users;
mod watcher;
mod workspace;

pub use error::AppError;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use tauri::Manager;

pub use commands::SessionInfo;
pub use users::UserInfo;
pub use workspace::WorkspaceInfo;

pub struct StateData {
    workspace: Option<(PathBuf, WorkspaceInfo)>,
    user: Option<UserInfo>,
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
                user: None,
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
            // A workspace switch invalidates the previous watcher.
            guard.watcher = None;
        }
        *self.audit_root.write() = Some(root);
    }

    pub fn set_user(&self, user: UserInfo) {
        self.inner.lock().user = Some(user);
    }

    pub fn clear_user(&self) {
        self.inner.lock().user = None;
    }

    pub fn actor(&self) -> String {
        self.inner
            .lock()
            .user
            .as_ref()
            .map(|u| u.login.clone())
            .unwrap_or_else(|| "system".to_string())
    }

    pub fn session(&self) -> SessionInfo {
        let guard = self.inner.lock();
        SessionInfo {
            workspace: guard.workspace.as_ref().map(|(_, info)| info.clone()),
            user: guard.user.clone(),
            machine_id: guard.machine_id.clone(),
        }
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