use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    #[serde(default)]
    pub assignees: Vec<String>,
    pub author_id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub checklist: Vec<ChecklistItem>,
    #[serde(default)]
    pub comments: Vec<Comment>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    pub version: u64,
    #[serde(default)]
    pub watchers: Vec<String>,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    New,
    InProgress,
    Review,
    Done,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    #[default]
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author_id: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub name: String,
    // TODO(Stage 5): replace 'path' with 'sha256' for content-addressable deduplication
    pub path: String,
    pub size: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskPayload {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub priority: TaskPriority,
    #[serde(default)]
    pub assignees: Vec<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub checklist: Vec<ChecklistItem>,
    #[serde(default)]
    pub watchers: Vec<String>,
    #[serde(default)]
    pub project_id: Option<String>,
}

/// Partial update. A missing field is left unchanged; `null` clears an optional
/// field (`dueDate`, `projectId`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskPayload {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: Option<TaskPriority>,
    #[serde(default)]
    pub assignees: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option::deserialize")]
    pub due_date: Option<Option<String>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub checklist: Option<Vec<ChecklistItem>>,
    #[serde(default)]
    pub watchers: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option::deserialize")]
    pub project_id: Option<Option<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFilter {
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub status: Option<TaskStatus>,
    #[serde(default)]
    pub assignee_id: Option<String>,
}

mod double_option {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Option::<T>::deserialize(deserializer).map(Some)
    }
}

fn validate_title(title: &str) -> Result<String, AppError> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 300 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "task title must be between 1 and 300 characters",
        ));
    }
    Ok(title.to_string())
}

fn task_path(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(AppError::new("INVALID_INPUT", "invalid task id"));
    }
    crate::path::resolve_rel(root, &format!("tasks/{id}.json"))
}

fn version_conflict(task: &Task) -> AppError {
    match serde_json::to_string(task) {
        Ok(details) => AppError::with_details(
            "VERSION_CONFLICT",
            "task was modified by another user",
            details,
        ),
        Err(_) => AppError::new("VERSION_CONFLICT", "task was modified by another user"),
    }
}

/// Lists every task file, newest `updatedAt` first.
pub fn list(root: &Path) -> Result<Vec<Task>, AppError> {
    let dir = root.join("tasks");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut tasks = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list tasks", e))? {
        let entry = entry.map_err(|e| AppError::io("read tasks dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        tasks.push(fsops::read_json::<Task>(&path)?);
    }
    tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id)));
    Ok(tasks)
}

pub fn get(root: &Path, id: &str) -> Result<Task, AppError> {
    let path = task_path(root, id)?;
    if !path.is_file() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("task '{id}' does not exist"),
        ));
    }
    fsops::read_json(&path)
}

pub fn create(
    root: &Path,
    author_id: &str,
    payload: CreateTaskPayload,
) -> Result<Task, AppError> {
    let title = validate_title(&payload.title)?;
    let now = now_rfc3339();
    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        description: payload.description,
        status: payload.status,
        priority: payload.priority,
        assignees: payload.assignees,
        author_id: author_id.to_string(),
        created_at: now.clone(),
        updated_at: now,
        due_date: payload.due_date,
        tags: payload.tags,
        checklist: payload.checklist,
        comments: Vec::new(),
        attachments: Vec::new(),
        version: 1,
        watchers: payload.watchers,
        project_id: payload.project_id,
    };
    fsops::write_json_atomic(&task_path(root, &task.id)?, &task)?;
    Ok(task)
}

pub fn update(
    root: &Path,
    id: &str,
    patch: UpdateTaskPayload,
    expected_version: u64,
) -> Result<Task, AppError> {
    let mut task = get(root, id)?;
    if task.version != expected_version {
        return Err(version_conflict(&task));
    }
    if let Some(title) = patch.title {
        task.title = validate_title(&title)?;
    }
    if let Some(description) = patch.description {
        task.description = description;
    }
    if let Some(priority) = patch.priority {
        task.priority = priority;
    }
    if let Some(assignees) = patch.assignees {
        task.assignees = assignees;
    }
    if let Some(due_date) = patch.due_date {
        task.due_date = due_date;
    }
    if let Some(tags) = patch.tags {
        task.tags = tags;
    }
    if let Some(checklist) = patch.checklist {
        task.checklist = checklist;
    }
    if let Some(watchers) = patch.watchers {
        task.watchers = watchers;
    }
    if let Some(project_id) = patch.project_id {
        task.project_id = project_id;
    }
    task.version += 1;
    task.updated_at = now_rfc3339();
    fsops::write_json_atomic(&task_path(root, id)?, &task)?;
    Ok(task)
}

pub fn change_status(
    root: &Path,
    id: &str,
    status: TaskStatus,
    expected_version: u64,
) -> Result<Task, AppError> {
    let mut task = get(root, id)?;
    if task.version != expected_version {
        return Err(version_conflict(&task));
    }
    task.status = status;
    task.version += 1;
    task.updated_at = now_rfc3339();
    fsops::write_json_atomic(&task_path(root, id)?, &task)?;
    Ok(task)
}

pub fn delete(root: &Path, id: &str) -> Result<(), AppError> {
    let path = task_path(root, id)?;
    if !path.is_file() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("task '{id}' does not exist"),
        ));
    }
    fsops::remove_path(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    fn payload(value: serde_json::Value) -> CreateTaskPayload {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn serializes_camel_case_and_enum_values() {
        let dir = tempdir().unwrap();
        let task = create(
            dir.path(),
            "u1",
            payload(json!({
                "title": "Ship it",
                "assignees": ["u2"],
                "dueDate": "2026-11-01T00:00:00Z",
                "projectId": "p1",
            })),
        )
        .unwrap();

        let value = serde_json::to_value(&task).unwrap();
        for key in [
            "id",
            "title",
            "description",
            "status",
            "priority",
            "assignees",
            "authorId",
            "createdAt",
            "updatedAt",
            "dueDate",
            "tags",
            "checklist",
            "comments",
            "attachments",
            "version",
            "watchers",
            "projectId",
        ] {
            assert!(value.get(key).is_some(), "missing key {key}");
        }
        assert_eq!(value["status"], "new");
        assert_eq!(value["priority"], "medium");
        assert_eq!(value["version"], 1);
        assert_eq!(value["projectId"], "p1");
        assert!(dir.path().join("tasks").join(format!("{}.json", task.id)).is_file());
    }

    #[test]
    fn update_payload_distinguishes_missing_null_and_value() {
        let missing: UpdateTaskPayload = serde_json::from_value(json!({})).unwrap();
        assert_eq!(missing.due_date, None);

        let cleared: UpdateTaskPayload =
            serde_json::from_value(json!({ "dueDate": null })).unwrap();
        assert_eq!(cleared.due_date, Some(None));

        let set: UpdateTaskPayload =
            serde_json::from_value(json!({ "dueDate": "2026-12-01T00:00:00Z" })).unwrap();
        assert_eq!(set.due_date, Some(Some("2026-12-01T00:00:00Z".to_string())));
    }

    #[test]
    fn rejects_blank_title_and_invalid_id() {
        let dir = tempdir().unwrap();
        let err = create(dir.path(), "u1", payload(json!({ "title": "  " }))).unwrap_err();
        assert_eq!(err.code, "INVALID_INPUT");

        let err = get(dir.path(), "not-a-uuid").unwrap_err();
        assert_eq!(err.code, "INVALID_INPUT");
    }
}
