use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;
use crate::roles;

pub const SCHEMA_VERSION: u32 = 3;

/// Directories created for every workspace (the SMB data layout).
pub const WORKSPACE_DIRS: [&str; 10] = [
    "users",
    "roles",
    "spaces",
    "projects",
    "tasks",
    "notes",
    "attachments",
    "locks",
    "events",
    "audit",
];

/// Admin-configurable session lifetime in days. 0 means "never expire".
pub const DEFAULT_SESSION_LIFETIME_DAYS: u32 = 30;

fn default_session_lifetime_days() -> u32 {
    DEFAULT_SESSION_LIFETIME_DAYS
}

/// Current configured session lifetime in days.
pub fn session_lifetime_days(root: &Path) -> Result<u32, AppError> {
    Ok(read_cfg(root)?.session_lifetime_days)
}

/// Persists the session lifetime (days). 0 = never expire.
pub fn set_session_lifetime_days(root: &Path, days: u32) -> Result<u32, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.session_lifetime_days = days;
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(days)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub schema_version: u32,
    pub workspace_id: String,
    pub name: String,
    pub created_at: String,
    /// Marks that the workspace carries the Stage 9 plugin defaults (extensions
    /// hidden/disabled until the master toggle is turned on).
    #[serde(default)]
    pub plugins_enabled_by_default: bool,
    /// Master switch for the extension system. OFF by default; when off, the
    /// «Расширения» menu item and all plugin UI (sidebar/topbar/floating) are
    /// hidden.
    #[serde(default)]
    pub plugins_enabled: bool,
    /// Per-plugin on/off state, e.g. `{ "llm-assistant": false }`. A plugin
    /// that is not present is treated as disabled.
    #[serde(default)]
    pub plugins_state: std::collections::BTreeMap<String, bool>,
    /// Admin session lifetime in days (0 = never expire).
    #[serde(default = "default_session_lifetime_days")]
    pub session_lifetime_days: u32,
    /// When importing a `.md` file, create/assign a category named after the
    /// source file's parent folder.
    #[serde(default = "default_true")]
    pub auto_create_category_on_import: bool,
    /// Days a task stays in the trash before it is permanently deleted
    /// (default 7).
    #[serde(default = "default_trash_retention_days")]
    pub trash_retention_days: u32,
    /// Notify assignees when a task is due within this many minutes
    /// (default 60).
    #[serde(default = "default_due_soon_notify_minutes")]
    pub due_soon_notify_minutes: u32,
    /// Date-fns-style format for the daily-note title (default `YYYY-MM-DD`).
    #[serde(default = "default_daily_note_format")]
    pub daily_note_format: String,
    /// User-defined Markdown templates (name → content).
    #[serde(default)]
    pub custom_templates: std::collections::HashMap<String, String>,
    /// Open notes in a new tab (default true).
    #[serde(default = "default_true")]
    pub open_notes_in_new_tab: bool,
    /// Open tasks in a new tab (default false).
    #[serde(default)]
    pub open_tasks_in_new_tab: bool,
    /// Persisted Kanban column order (status ids).
    #[serde(default = "default_kanban_order")]
    pub kanban_column_order: Vec<String>,
}

fn default_kanban_order() -> Vec<String> {
    ["new", "in_progress", "review", "done", "rejected", "trash"]
        .iter()
        .map(|value| value.to_string())
        .collect()
}

/// Tab behaviour settings exposed to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSettings {
    pub open_notes_in_new_tab: bool,
    pub open_tasks_in_new_tab: bool,
}

pub fn tab_settings(root: &Path) -> Result<TabSettings, AppError> {
    let cfg = read_cfg(root)?;
    Ok(TabSettings {
        open_notes_in_new_tab: cfg.open_notes_in_new_tab,
        open_tasks_in_new_tab: cfg.open_tasks_in_new_tab,
    })
}

pub fn set_tab_settings(root: &Path, settings: &TabSettings) -> Result<TabSettings, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.open_notes_in_new_tab = settings.open_notes_in_new_tab;
    cfg.open_tasks_in_new_tab = settings.open_tasks_in_new_tab;
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(settings.clone())
}

/// Persisted Kanban column order.
pub fn kanban_column_order(root: &Path) -> Result<Vec<String>, AppError> {
    Ok(read_cfg(root)?.kanban_column_order)
}

pub fn set_kanban_column_order(root: &Path, order: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.kanban_column_order = order;
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(cfg.kanban_column_order)
}

fn default_true() -> bool {
    true
}

fn default_trash_retention_days() -> u32 {
    7
}

fn default_due_soon_notify_minutes() -> u32 {
    60
}

fn default_daily_note_format() -> String {
    "YYYY-MM-DD".to_string()
}

/// Daily-note title format (date-fns tokens; default `YYYY-MM-DD`).
pub fn daily_note_format(root: &Path) -> Result<String, AppError> {
    Ok(read_cfg(root)?.daily_note_format)
}

pub fn set_daily_note_format(root: &Path, value: &str) -> Result<String, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.daily_note_format = value.trim().to_string();
    if cfg.daily_note_format.is_empty() {
        cfg.daily_note_format = default_daily_note_format();
    }
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(cfg.daily_note_format)
}

/// All user-defined Markdown templates.
pub fn custom_templates(
    root: &Path,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    Ok(read_cfg(root)?.custom_templates)
}

/// Saves (or replaces) a custom template and returns the full map.
pub fn save_template(
    root: &Path,
    name: &str,
    content: &str,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("INVALID_INPUT", "template name is required"));
    }
    let mut cfg = read_cfg(root)?;
    cfg.custom_templates
        .insert(name.to_string(), content.to_string());
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(cfg.custom_templates)
}

/// Removes a custom template and returns the full map.
pub fn delete_template(
    root: &Path,
    name: &str,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.custom_templates.remove(name.trim());
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(cfg.custom_templates)
}

/// Task-related workspace settings exposed to the UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSettings {
    pub trash_retention_days: u32,
    pub due_soon_notify_minutes: u32,
}

pub fn task_settings(root: &Path) -> Result<TaskSettings, AppError> {
    let cfg = read_cfg(root)?;
    Ok(TaskSettings {
        trash_retention_days: cfg.trash_retention_days,
        due_soon_notify_minutes: cfg.due_soon_notify_minutes,
    })
}

pub fn set_task_settings(root: &Path, settings: &TaskSettings) -> Result<TaskSettings, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.trash_retention_days = settings.trash_retention_days;
    cfg.due_soon_notify_minutes = settings.due_soon_notify_minutes;
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(settings.clone())
}

/// Trash retention in days (0 disables auto-deletion).
pub fn trash_retention_days(root: &Path) -> Result<u32, AppError> {
    Ok(read_cfg(root)?.trash_retention_days)
}

/// Due-soon notification window in minutes (0 disables the check).
pub fn due_soon_notify_minutes(root: &Path) -> Result<u32, AppError> {
    Ok(read_cfg(root)?.due_soon_notify_minutes)
}

/// Current import setting: auto-create category from the source folder name.
pub fn auto_create_category_on_import(root: &Path) -> Result<bool, AppError> {
    Ok(read_cfg(root)?.auto_create_category_on_import)
}

/// Persists the import setting.
pub fn set_auto_create_category_on_import(root: &Path, value: bool) -> Result<bool, AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.auto_create_category_on_import = value;
    fsops::write_json_atomic(&root.join("config.json"), &cfg)?;
    Ok(value)
}

/// Plugin management settings exposed to the UI (workspace-wide).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettings {
    pub enabled: bool,
    pub plugins: std::collections::BTreeMap<String, bool>,
}

/// Reads the workspace `config.json`.
fn read_cfg(root: &Path) -> Result<WorkspaceConfig, AppError> {
    fsops::read_json(&root.join("config.json"))
}

/// Current plugin settings (defaults applied when the fields are absent).
pub fn plugin_settings(root: &Path) -> Result<PluginSettings, AppError> {
    let cfg = read_cfg(root)?;
    Ok(PluginSettings {
        enabled: cfg.plugins_enabled,
        plugins: cfg.plugins_state,
    })
}

/// Persists the plugin settings into the workspace `config.json` (atomic).
pub fn set_plugin_settings(root: &Path, settings: &PluginSettings) -> Result<(), AppError> {
    let mut cfg = read_cfg(root)?;
    cfg.plugins_enabled = settings.enabled;
    cfg.plugins_state = settings.plugins.clone();
    fsops::write_json_atomic(&root.join("config.json"), &cfg)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub path: String,
    pub name: String,
    pub workspace_id: String,
    pub schema_version: u32,
    pub created_at: String,
}

fn info(root: &Path, cfg: &WorkspaceConfig) -> WorkspaceInfo {
    WorkspaceInfo {
        path: root.to_string_lossy().into_owned(),
        name: cfg.name.clone(),
        workspace_id: cfg.workspace_id.clone(),
        schema_version: cfg.schema_version,
        created_at: cfg.created_at.clone(),
    }
}

/// Validates that `root` holds a TaskFlow workspace and returns its metadata.
pub fn validate(root: &Path) -> Result<WorkspaceInfo, AppError> {
    let config_path = root.join("config.json");
    if !config_path.exists() {
        return Err(AppError::new(
            "NOT_WORKSPACE",
            format!(
                "'{}' is not a TaskFlow workspace (config.json not found)",
                root.display()
            ),
        ));
    }
    let cfg: WorkspaceConfig = fsops::read_json(&config_path)?;
    if cfg.schema_version > SCHEMA_VERSION {
        return Err(AppError::new(
            "SCHEMA_TOO_NEW",
            format!(
                "workspace schema v{} is newer than this app supports (v{})",
                cfg.schema_version, SCHEMA_VERSION
            ),
        ));
    }
    Ok(info(root, &cfg))
}

/// Creates the workspace directory tree, seed roles and config.json.
/// config.json is created exclusively, so two concurrent first-runs cannot
/// both claim the same folder.
pub fn init(root: &Path, name: &str) -> Result<WorkspaceInfo, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "workspace name must be between 1 and 80 characters",
        ));
    }

    std::fs::create_dir_all(root).map_err(|e| AppError::io("create workspace directory", e))?;

    let config_path = root.join("config.json");
    if config_path.exists() {
        return Err(AppError::new(
            "ALREADY_EXISTS",
            "a workspace already exists at this path",
        ));
    }

    for dir in WORKSPACE_DIRS {
        std::fs::create_dir_all(root.join(dir))
            .map_err(|e| AppError::io(format!("create '{dir}'"), e))?;
    }

    for role in roles::default_roles() {
        let role_path = root.join("roles").join(format!("{}.json", role.id));
        if !role_path.exists() {
            fsops::write_json_atomic(&role_path, &role)?;
        }
    }

    let cfg = WorkspaceConfig {
        schema_version: SCHEMA_VERSION,
        workspace_id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        created_at: now_rfc3339(),
        // Stage 9: extension system starts disabled (master toggle OFF); the
        // bundled AI assistant ships disabled until enabled in settings.
        plugins_enabled_by_default: true,
        plugins_enabled: false,
        plugins_state: std::collections::BTreeMap::from([("llm-assistant".to_string(), false)]),
        session_lifetime_days: DEFAULT_SESSION_LIFETIME_DAYS,
        auto_create_category_on_import: true,
        trash_retention_days: 7,
        due_soon_notify_minutes: 60,
        daily_note_format: default_daily_note_format(),
        custom_templates: Default::default(),
        open_notes_in_new_tab: true,
        open_tasks_in_new_tab: false,
        kanban_column_order: default_kanban_order(),
    };
    let mut bytes = serde_json::to_vec_pretty(&cfg)?;
    bytes.push(b'\n');
    fsops::create_exclusive(&config_path, &bytes)?;

    crate::audit::write_event(
        root,
        &crate::session::ActorId::System("init").label(),
        "workspace.created",
        "workspace",
        &cfg.workspace_id,
        serde_json::json!({ "name": cfg.name }),
    )?;

    Ok(info(root, &cfg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn init_creates_layout_and_config() {
        let dir = tempdir().unwrap();
        let info = init(dir.path(), "Test WS").unwrap();
        assert_eq!(info.name, "Test WS");
        assert_eq!(info.schema_version, SCHEMA_VERSION);
        assert!(dir.path().join("config.json").exists());
        for d in WORKSPACE_DIRS {
            assert!(dir.path().join(d).is_dir(), "missing dir {d}");
        }
        for r in roles::default_roles() {
            assert!(dir.path().join("roles").join(format!("{}.json", r.id)).exists());
        }
        // journal event written
        let events: Vec<_> = std::fs::read_dir(dir.path().join("events"))
            .unwrap()
            .collect();
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn init_is_exclusive() {
        let dir = tempdir().unwrap();
        init(dir.path(), "One").unwrap();
        let err = init(dir.path(), "Two").unwrap_err();
        assert_eq!(err.code, "ALREADY_EXISTS");
    }

    #[test]
    fn init_rejects_empty_name() {
        let dir = tempdir().unwrap();
        assert!(init(dir.path(), "   ").is_err());
    }

    #[test]
    fn validate_reports_non_workspace() {
        let dir = tempdir().unwrap();
        let err = validate(dir.path()).unwrap_err();
        assert_eq!(err.code, "NOT_WORKSPACE");
    }

    #[test]
    fn validate_roundtrip() {
        let dir = tempdir().unwrap();
        let created = init(dir.path(), "Round").unwrap();
        let found = validate(dir.path()).unwrap();
        assert_eq!(created.workspace_id, found.workspace_id);
        assert_eq!(created.name, found.name);
    }
}