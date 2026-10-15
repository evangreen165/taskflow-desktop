use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;
use crate::roles;

pub const SCHEMA_VERSION: u32 = 1;

/// Directories created for every workspace (the SMB data layout).
pub const WORKSPACE_DIRS: [&str; 9] = [
    "users",
    "roles",
    "projects",
    "tasks",
    "notes",
    "attachments",
    "locks",
    "events",
    "audit",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub schema_version: u32,
    pub workspace_id: String,
    pub name: String,
    pub created_at: String,
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
    };
    let mut bytes = serde_json::to_vec_pretty(&cfg)?;
    bytes.push(b'\n');
    fsops::create_exclusive(&config_path, &bytes)?;

    crate::audit::write_event(
        root,
        "system",
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