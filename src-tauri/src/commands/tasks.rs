use std::path::Path;

use tauri::State;

use taskflow_macros::write_command;

use crate::error::AppError;
use crate::roles;
use crate::session::Session;
use crate::tasks::{self, CreateTaskPayload, Task, TaskFilter, TaskStatus, UpdateTaskPayload};
use crate::AppState;

fn has_perm(root: &Path, session: &Session, perm: &str) -> Result<bool, AppError> {
    Ok(roles::permissions_for(root, &session.role_id)?
        .iter()
        .any(|p| p == perm))
}

/// Callers without `task.view_all` may only see tasks they authored or are
/// assigned to. This also guards write commands (mutating by UUID must not
/// bypass the list visibility rule).
fn ensure_visible(root: &Path, session: &Session, task: &Task) -> Result<(), AppError> {
    if has_perm(root, session, "task.view_all")? {
        return Ok(());
    }
    if task.author_id == session.user_id || task.assignees.iter().any(|a| a == &session.user_id) {
        Ok(())
    } else {
        Err(AppError::new(
            "FORBIDDEN",
            "this task is not visible to you",
        ))
    }
}

fn matches_filter(task: &Task, filter: &TaskFilter) -> bool {
    if let Some(project_id) = &filter.project_id {
        if task.project_id.as_deref() != Some(project_id.as_str()) {
            return false;
        }
    }
    if let Some(status) = filter.status {
        if task.status != status {
            return false;
        }
    }
    if let Some(assignee_id) = &filter.assignee_id {
        if !task.assignees.iter().any(|a| a == assignee_id) {
            return false;
        }
    }
    true
}

pub fn tasks_list_impl(state: &AppState, filter: TaskFilter) -> Result<Vec<Task>, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    let view_all = has_perm(&root, &session, "task.view_all")?;
    let mut tasks = tasks::list(&root)?;
    tasks.retain(|task| {
        matches_filter(task, &filter)
            && (view_all
                || task.author_id == session.user_id
                || task.assignees.iter().any(|a| a == &session.user_id))
    });
    Ok(tasks)
}

#[tauri::command(rename = "tasksList")]
pub fn tasks_list(state: State<'_, AppState>, filter: TaskFilter) -> Result<Vec<Task>, AppError> {
    tasks_list_impl(&state, filter)
}

pub fn tasks_get_impl(state: &AppState, id: String) -> Result<Task, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    let task = tasks::get(&root, &id)?;
    ensure_visible(&root, &session, &task)?;
    Ok(task)
}

#[tauri::command(rename = "tasksGet")]
pub fn tasks_get(state: State<'_, AppState>, id: String) -> Result<Task, AppError> {
    tasks_get_impl(&state, id)
}

pub fn tasks_create_impl(
    state: &AppState,
    payload: CreateTaskPayload,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.create")?;
    let root = state.root()?;
    tasks::create(&root, &session.user_id, payload)
}

#[write_command(rename = "tasksCreate")]
pub fn tasks_create(
    state: State<'_, AppState>,
    payload: CreateTaskPayload,
) -> Result<Task, AppError> {
    tasks_create_impl(&state, payload)
}

pub fn tasks_update_impl(
    state: &AppState,
    id: String,
    patch: UpdateTaskPayload,
    expected_version: u64,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.edit")?;
    let root = state.root()?;
    let current = tasks::get(&root, &id)?;
    ensure_visible(&root, &session, &current)?;
    tasks::update(&root, &id, patch, expected_version)
}

#[write_command(rename = "tasksUpdate")]
pub fn tasks_update(
    state: State<'_, AppState>,
    id: String,
    patch: UpdateTaskPayload,
    expected_version: u64,
) -> Result<Task, AppError> {
    tasks_update_impl(&state, id, patch, expected_version)
}

pub fn tasks_change_status_impl(
    state: &AppState,
    id: String,
    status: TaskStatus,
    expected_version: u64,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.change_status")?;
    let root = state.root()?;
    let current = tasks::get(&root, &id)?;
    ensure_visible(&root, &session, &current)?;
    tasks::change_status(&root, &id, status, expected_version)
}

#[write_command(rename = "tasksChangeStatus")]
pub fn tasks_change_status(
    state: State<'_, AppState>,
    id: String,
    status: TaskStatus,
    expected_version: u64,
) -> Result<Task, AppError> {
    tasks_change_status_impl(&state, id, status, expected_version)
}

pub fn tasks_delete_impl(state: &AppState, id: String) -> Result<(), AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.delete")?;
    let root = state.root()?;
    let task = tasks::get(&root, &id)?;
    ensure_visible(&root, &session, &task)?;
    tasks::delete(&root, &id)
}

#[write_command(rename = "tasksDelete")]
pub fn tasks_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    tasks_delete_impl(&state, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::tasks::{CreateTaskPayload, TaskPriority, UpdateTaskPayload};
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use serde_json::json;
    use tempfile::tempdir;

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        executor: UserInfo,
        observer: UserInfo,
    }

    fn session_for(user_id: &str, role_id: &str) -> Session {
        Session {
            user_id: user_id.to_string(),
            login: "login".to_string(),
            display_name: "Name".to_string(),
            role_id: role_id.to_string(),
            avatar_color: "#5b5bd6".to_string(),
            must_change_password: false,
            login_at: "2026-10-01T00:00:00Z".to_string(),
            role_missing_reported: false,
        }
    }

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Tasks").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "Executor", "executor", None).unwrap();
        let observer =
            users::create(dir.path(), "obs", "password123", "Observer", "observer", None).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        Fixture {
            _dir: dir,
            state,
            admin,
            executor,
            observer,
        }
    }

    fn create_payload(value: serde_json::Value) -> CreateTaskPayload {
        serde_json::from_value(value).unwrap()
    }

    fn update_payload(value: serde_json::Value) -> UpdateTaskPayload {
        serde_json::from_value(value).unwrap()
    }

    fn create_task(fx: &Fixture, title: &str, assignees: &[&str]) -> Task {
        tasks_create_impl(
            &fx.state,
            create_payload(json!({
                "title": title,
                "assignees": assignees,
            })),
        )
        .unwrap()
    }

    #[test]
    fn create_list_get() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        assert_eq!(task.version, 1);
        assert_eq!(task.author_id, fx.admin.id);

        let listed = tasks_list_impl(&fx.state, TaskFilter::default()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, task.id);

        let fetched = tasks_get_impl(&fx.state, task.id.clone()).unwrap();
        assert_eq!(fetched.title, "First");
    }

    #[test]
    fn update_increments_version() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        let updated = tasks_update_impl(
            &fx.state,
            task.id.clone(),
            update_payload(json!({ "title": "Renamed", "priority": "high" })),
            1,
        )
        .unwrap();
        assert_eq!(updated.version, 2);
        assert_eq!(updated.title, "Renamed");
        assert_eq!(updated.priority, TaskPriority::High);
    }

    #[test]
    fn update_version_conflict_returns_current_task() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        let err = tasks_update_impl(
            &fx.state,
            task.id.clone(),
            update_payload(json!({ "title": "Renamed" })),
            99,
        )
        .unwrap_err();
        assert_eq!(err.code, "VERSION_CONFLICT");
        let current: Task = serde_json::from_str(err.details.as_deref().unwrap()).unwrap();
        assert_eq!(current.id, task.id);
        assert_eq!(current.version, 1);
        assert_eq!(current.title, "First");
    }

    #[test]
    fn delete_then_get_not_found() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        tasks_delete_impl(&fx.state, task.id.clone()).unwrap();
        assert_eq!(
            tasks_get_impl(&fx.state, task.id).unwrap_err().code,
            "NOT_FOUND"
        );
    }

    #[test]
    fn executor_cannot_delete() {
        let fx = fixture();
        let task = create_task(&fx, "Assigned", &[&fx.executor.id]);
        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let err = tasks_delete_impl(&fx.state, task.id).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn executor_sees_only_own_tasks() {
        let fx = fixture();
        let mine = create_task(&fx, "Mine", &[&fx.executor.id]);
        let other = create_task(&fx, "Other", &[]);

        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let listed = tasks_list_impl(&fx.state, TaskFilter::default()).unwrap();
        let ids: Vec<&str> = listed.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec![mine.id.as_str()]);
        assert!(!ids.contains(&other.id.as_str()));
    }

    #[test]
    fn executor_get_hidden_task_forbidden() {
        let fx = fixture();
        let hidden = create_task(&fx, "Hidden", &[]);
        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let err = tasks_get_impl(&fx.state, hidden.id).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn executor_change_status_hidden_forbidden() {
        let fx = fixture();
        let hidden = create_task(&fx, "Hidden", &[]);
        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let err =
            tasks_change_status_impl(&fx.state, hidden.id, TaskStatus::InProgress, 1).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn observer_cannot_create() {
        let fx = fixture();
        fx.state
            .set_session(session_for(&fx.observer.id, "observer"));
        let err = tasks_create_impl(
            &fx.state,
            create_payload(json!({ "title": "Nope" })),
        )
        .unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn change_status_increments_and_conflicts() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        let changed =
            tasks_change_status_impl(&fx.state, task.id.clone(), TaskStatus::InProgress, 1).unwrap();
        assert_eq!(changed.status, TaskStatus::InProgress);
        assert_eq!(changed.version, 2);

        let err =
            tasks_change_status_impl(&fx.state, task.id, TaskStatus::Done, 1).unwrap_err();
        assert_eq!(err.code, "VERSION_CONFLICT");
        let current: Task = serde_json::from_str(err.details.as_deref().unwrap()).unwrap();
        assert_eq!(current.version, 2);
        assert_eq!(current.status, TaskStatus::InProgress);
    }

    #[test]
    fn list_filters_by_status_assignee_and_project() {
        let fx = fixture();
        let first = tasks_create_impl(
            &fx.state,
            create_payload(json!({
                "title": "A",
                "status": "in_progress",
                "assignees": [fx.executor.id],
                "projectId": "p1",
            })),
        )
        .unwrap();
        let second = tasks_create_impl(
            &fx.state,
            create_payload(json!({ "title": "B", "projectId": "p2" })),
        )
        .unwrap();

        let by_status = tasks_list_impl(
            &fx.state,
            TaskFilter {
                status: Some(TaskStatus::InProgress),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_status.len(), 1);
        assert_eq!(by_status[0].id, first.id);

        let by_assignee = tasks_list_impl(
            &fx.state,
            TaskFilter {
                assignee_id: Some(fx.executor.id.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_assignee.len(), 1);
        assert_eq!(by_assignee[0].id, first.id);

        let by_project = tasks_list_impl(
            &fx.state,
            TaskFilter {
                project_id: Some("p2".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_project.len(), 1);
        assert_eq!(by_project[0].id, second.id);
    }
}
