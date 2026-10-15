use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fsops;
use crate::permissions;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub is_system: bool,
    pub color: String,
}

fn role(id: &str, name: &str, description: &str, color: &str, permissions: &[&str]) -> Role {
    Role {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        permissions: permissions.iter().map(|p| p.to_string()).collect(),
        is_system: true,
        color: color.to_string(),
    }
}

/// Seed roles mirror the Stage 2 permission matrix.
pub fn default_roles() -> Vec<Role> {
    vec![
        role(
            "admin",
            "Администратор",
            "Полный доступ к workspace, пользователям и ролям",
            "#5b5bd6",
            &permissions::ALL,
        ),
        role(
            "manager",
            "Руководитель",
            "Создаёт и ведёт задачи, видит все задачи",
            "#3b82f6",
            &[
                "task.view",
                "task.create",
                "task.edit",
                "task.change_status",
                "task.assign",
                "task.view_all",
                "article.view",
            ],
        ),
        role(
            "executor",
            "Исполнитель",
            "Работает со своими задачами, меняет статусы",
            "#10b981",
            &["task.view", "task.change_status", "article.view"],
        ),
        role(
            "observer",
            "Наблюдатель",
            "Только просмотр задач и статей",
            "#f59e0b",
            &["task.view", "task.view_all", "article.view"],
        ),
        role(
            "kb_author",
            "Автор KB",
            "Ведёт базу знаний",
            "#8b5cf6",
            &[
                "task.view",
                "article.view",
                "article.create",
                "article.edit",
                "article.publish",
            ],
        ),
        role(
            "kb_reader",
            "Читатель KB",
            "Только чтение базы знаний",
            "#6b7280",
            &["article.view"],
        ),
    ]
}

fn role_path(root: &Path, role_id: &str) -> PathBuf {
    root.join("roles").join(format!("{role_id}.json"))
}

/// Lists every role file in `roles/`, sorted by id.
pub fn list(root: &Path) -> Result<Vec<Role>, AppError> {
    let dir = root.join("roles");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut roles = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| AppError::io(format!("list '{}'", dir.display()), e))?
    {
        let entry = entry.map_err(|e| AppError::io("read roles dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        roles.push(fsops::read_json::<Role>(&path)?);
    }
    roles.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(roles)
}

/// Reads one role; a missing file is `ROLE_NOT_FOUND` (never an empty role).
pub fn get(root: &Path, role_id: &str) -> Result<Role, AppError> {
    let path = role_path(root, role_id);
    if !path.is_file() {
        return Err(AppError::new(
            "ROLE_NOT_FOUND",
            format!("role '{role_id}' does not exist"),
        ));
    }
    fsops::read_json(&path)
}

/// Resolves the effective permissions of a role. Reads the role from disk on
/// every call so role edits take effect per-call. A missing role file is a hard
/// `ROLE_NOT_FOUND` — it must never silently grant permissions.
pub fn permissions_for(root: &Path, role_id: &str) -> Result<Vec<String>, AppError> {
    let role = get(root, role_id)?;
    Ok(permissions::filter_valid(role.permissions))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_role(root: &Path, role: &Role) {
        fsops::write_json_atomic(&role_path(root, &role.id), role).unwrap();
    }

    #[test]
    fn seeds_use_the_stage_two_registry() {
        let roles = default_roles();
        assert_eq!(roles.len(), 6);
        let admin = roles.iter().find(|r| r.id == "admin").unwrap();
        let mut admin_perms = admin.permissions.clone();
        admin_perms.sort();
        let mut all: Vec<String> = permissions::ALL.iter().map(|p| p.to_string()).collect();
        all.sort();
        assert_eq!(admin_perms, all);
        for r in &roles {
            for perm in &r.permissions {
                assert!(permissions::is_valid(perm), "{} has invalid {perm}", r.id);
            }
        }
        let manager = roles.iter().find(|r| r.id == "manager").unwrap();
        assert!(!manager.permissions.iter().any(|p| p == "audit.view"));
        assert!(!roles.iter().any(|r| r
            .permissions
            .iter()
            .any(|p| p == "attachments.add" || p == "workspace.manage")));
    }

    #[test]
    fn list_returns_roles_sorted_by_id() {
        let dir = tempdir().unwrap();
        for role in default_roles() {
            write_role(dir.path(), &role);
        }
        let listed = list(dir.path()).unwrap();
        let ids: Vec<&str> = listed.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["admin", "executor", "kb_author", "kb_reader", "manager", "observer"]
        );
    }

    #[test]
    fn get_missing_role_is_role_not_found() {
        let dir = tempdir().unwrap();
        let err = get(dir.path(), "ghost").unwrap_err();
        assert_eq!(err.code, "ROLE_NOT_FOUND");
        assert_eq!(permissions_for(dir.path(), "ghost").unwrap_err().code, "ROLE_NOT_FOUND");
    }

    #[test]
    fn permissions_for_filters_unknown_entries() {
        let dir = tempdir().unwrap();
        let mut role = default_roles().into_iter().find(|r| r.id == "executor").unwrap();
        role.permissions.push("custom.perm".to_string());
        write_role(dir.path(), &role);
        assert_eq!(
            permissions_for(dir.path(), "executor").unwrap(),
            vec![
                "task.view".to_string(),
                "task.change_status".to_string(),
                "article.view".to_string()
            ]
        );
    }
}
