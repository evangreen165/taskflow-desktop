use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;
use crate::session::Session;

pub const DEFAULT_SPACE_ID: &str = "default";
pub const DEFAULT_SPACE_NAME: &str = "Основное";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub owner_id: String,
    pub members: Vec<String>,
}

pub fn is_valid_space_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn spaces_dir(root: &Path) -> PathBuf {
    root.join("spaces")
}

/// Absolute path of a space directory (`spaces/{id}`), validated for traversal.
pub fn space_dir(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    if !is_valid_space_id(id) {
        return Err(AppError::new("INVALID_INPUT", "invalid space id"));
    }
    crate::path::resolve_rel(root, &format!("spaces/{id}"))
}

fn space_path(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    Ok(space_dir(root, id)?.join("space.json"))
}

pub fn list(root: &Path) -> Result<Vec<Space>, AppError> {
    let dir = spaces_dir(root);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut spaces = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list spaces", e))? {
        let entry = entry.map_err(|e| AppError::io("read spaces dir", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let file = path.join("space.json");
        if !file.is_file() {
            continue;
        }
        spaces.push(fsops::read_json::<Space>(&file)?);
    }
    spaces.sort_by(|a, b| {
        is_personal(&b.id)
            .cmp(&is_personal(&a.id))
            .then_with(|| a.created_at.cmp(&b.created_at))
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(spaces)
}

pub fn get(root: &Path, id: &str) -> Result<Space, AppError> {
    let path = space_path(root, id)?;
    if !path.is_file() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("space '{id}' does not exist"),
        ));
    }
    fsops::read_json(&path)
}

pub fn write_space(root: &Path, space: &Space) -> Result<(), AppError> {
    fsops::write_json_atomic(&space_path(root, &space.id)?, space)
}

pub fn create(
    root: &Path,
    owner_id: &str,
    name: &str,
    description: &str,
) -> Result<Space, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "space name must be between 1 and 80 characters",
        ));
    }
    let space = Space {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        description: description.trim().to_string(),
        created_at: now_rfc3339(),
        owner_id: owner_id.to_string(),
        members: vec![owner_id.to_string()],
    };
    write_space(root, &space)?;
    Ok(space)
}

pub fn update(
    root: &Path,
    id: &str,
    name: &str,
    description: &str,
    members: Vec<String>,
) -> Result<Space, AppError> {
    let mut space = get(root, id)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "space name must be between 1 and 80 characters",
        ));
    }
    space.name = name.to_string();
    space.description = description.trim().to_string();
    let mut members: Vec<String> = members
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();
    members.sort();
    members.dedup();
    if !members.iter().any(|m| m == &space.owner_id) {
        members.push(space.owner_id.clone());
    }
    space.members = members;
    write_space(root, &space)?;
    Ok(space)
}

pub fn delete(root: &Path, id: &str) -> Result<(), AppError> {
    let dir = space_dir(root, id)?;
    if !dir.is_dir() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("space '{id}' does not exist"),
        ));
    }
    std::fs::remove_dir_all(&dir).map_err(|e| AppError::io("remove space", e))
}

pub fn is_member(space: &Space, user_id: &str) -> bool {
    space.owner_id == user_id || space.members.iter().any(|m| m == user_id)
}

/// Every account gets a private space (`personal_{userId}`) for its own data.
pub fn ensure_personal(root: &Path, user_id: &str, display_name: &str) -> Result<(), AppError> {
    let id = format!("personal_{user_id}");
    let path = space_path(root, &id)?;
    if path.is_file() {
        return Ok(());
    }
    let space = Space {
        id,
        name: format!("Личное пространство {display_name}"),
        description: String::new(),
        created_at: now_rfc3339(),
        owner_id: user_id.to_string(),
        members: vec![user_id.to_string()],
    };
    write_space(root, &space)
}

/// True for the auto-generated personal space id.
pub fn is_personal(space_id: &str) -> bool {
    space_id.starts_with("personal_")
}

/// True when `space_id` is a personal space owned by `user_id`. A missing
/// space is simply not owned (never an error), so callers can fall back to
/// their normal permission checks.
pub fn is_personal_owner(
    root: &Path,
    space_id: &str,
    user_id: &str,
) -> Result<bool, AppError> {
    if !is_personal(space_id) {
        return Ok(false);
    }
    match get(root, space_id) {
        Ok(space) => Ok(space.owner_id == user_id),
        Err(e) if e.code == "NOT_FOUND" => Ok(false),
        Err(e) => Err(e),
    }
}

pub fn is_admin(session: &Session) -> bool {
    session.role_id == "admin"
}

/// Loads a space and verifies the session may access it (member or admin).
pub fn require_access(
    root: &Path,
    space_id: &str,
    session: &Session,
) -> Result<Space, AppError> {
    let space = get(root, space_id)?;
    if is_admin(session) || is_member(&space, &session.user_id) {
        Ok(space)
    } else {
        Err(AppError::new(
            "FORBIDDEN",
            "you are not a member of this space",
        ))
    }
}
