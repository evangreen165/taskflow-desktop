use std::path::Path;

use tauri::State;

use taskflow_macros::write_command;

use crate::error::AppError;
use crate::roles;
use crate::session::Session;
use crate::spaces::Space;
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

/// Assignees must belong to the task's space. Returns `INVALID_ASSIGNEE` for
/// any id that is not a member (owner included).
fn validate_assignees(space: &Space, assignees: &[String]) -> Result<(), AppError> {
    for assignee in assignees {
        if !crate::spaces::is_member(space, assignee) {
            return Err(AppError::new(
                "INVALID_ASSIGNEE",
                format!("user '{assignee}' is not a member of this space"),
            ));
        }
    }
    Ok(())
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
    if let Some(start) = &filter.start_date {
        let due = task.due_date.as_deref().map(|d| d.get(..10).unwrap_or(d));
        if due.is_none() || due.unwrap() < start.as_str() {
            return false;
        }
    }
    if let Some(end) = &filter.end_date {
        let due = task.due_date.as_deref().map(|d| d.get(..10).unwrap_or(d));
        if due.is_none() || due.unwrap() > end.as_str() {
            return false;
        }
    }
    if let Some(has_due) = filter.has_due_date {
        if task.due_date.is_some() != has_due {
            return false;
        }
    }
    true
}

#[cfg(test)]
pub fn tasks_list_impl(
    state: &AppState,
    space_id: String,
    filter: TaskFilter,
) -> Result<Vec<Task>, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let view_all = has_perm(&root, &session, "task.view_all")?;
    let mut tasks = tasks::list(&space_dir)?;
    tasks.retain(|task| {
        matches_filter(task, &filter)
            && (view_all
                || task.author_id == session.user_id
                || task.assignees.iter().any(|a| a == &session.user_id))
    });
    Ok(tasks)
}

#[tauri::command(rename = "tasksList")]
#[tracing::instrument(skip(state))]
pub async fn tasks_list(
    state: State<'_, AppState>,
    space_id: String,
    filter: TaskFilter,
) -> Result<Vec<Task>, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let view_all = has_perm(&root, &session, "task.view_all")?;
    let user_id = session.user_id.clone();
    let mut tasks = tokio::task::spawn_blocking(move || tasks::list(&space_dir))
        .await
        .map_err(|e| AppError::new("IO", format!("tasks list task failed: {e}")))??;
    tasks.retain(|task| {
        matches_filter(task, &filter)
            && (view_all
                || task.author_id == user_id
                || task.assignees.iter().any(|a| a == &user_id))
    });
    Ok(tasks)
}

#[cfg(test)]
pub fn tasks_get_impl(
    state: &AppState,
    space_id: String,
    id: String,
) -> Result<Task, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let task = tasks::get(&space_dir, &id)?;
    ensure_visible(&root, &session, &task)?;
    Ok(task)
}

#[tauri::command(rename = "tasksGet")]
#[tracing::instrument(skip(state))]
pub async fn tasks_get(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
) -> Result<Task, AppError> {
    let session = state.require_perm("task.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let task_id = id.clone();
    let task = tokio::task::spawn_blocking(move || tasks::get(&space_dir, &task_id))
        .await
        .map_err(|e| AppError::new("IO", format!("task get task failed: {e}")))??;
    ensure_visible(&root, &session, &task)?;
    Ok(task)
}

pub fn tasks_create_impl(
    state: &AppState,
    space_id: String,
    payload: CreateTaskPayload,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.create")?;
    let root = state.root()?;
    let space = crate::spaces::require_access(&root, &space_id, &session)?;
    validate_assignees(&space, &payload.assignees)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let task = tasks::create(&space_dir, &session.user_id, payload)?;
    if let Err(err) =
        crate::notifications::on_task_created(&root, &session.user_id, &space_id, &task)
    {
        tracing::warn!(error = %err.message, "failed to create task-assigned notifications");
    }
    Ok(task)
}

#[write_command(rename = "tasksCreate")]
pub fn tasks_create(
    state: State<'_, AppState>,
    space_id: String,
    payload: CreateTaskPayload,
) -> Result<Task, AppError> {
    tasks_create_impl(&state, space_id, payload)
}

pub fn tasks_update_impl(
    state: &AppState,
    space_id: String,
    id: String,
    patch: UpdateTaskPayload,
    expected_version: u64,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.edit")?;
    let root = state.root()?;
    let space = crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let current = tasks::get(&space_dir, &id)?;
    ensure_visible(&root, &session, &current)?;
    // Only newly added assignees must be space members, so legacy tasks keep
    // their existing assignees even if the membership changed later.
    if let Some(assignees) = &patch.assignees {
        let added: Vec<String> = assignees
            .iter()
            .filter(|id| !current.assignees.iter().any(|existing| existing == *id))
            .cloned()
            .collect();
        validate_assignees(&space, &added)?;
    }
    let updated = tasks::update(&space_dir, &id, patch, expected_version)?;
    if let Err(err) = crate::notifications::on_task_updated(
        &root,
        &session.user_id,
        &space_id,
        &current,
        &updated,
    ) {
        tracing::warn!(error = %err.message, "failed to create task-update notifications");
    }
    Ok(updated)
}

#[write_command(rename = "tasksUpdate")]
pub fn tasks_update(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
    patch: UpdateTaskPayload,
    expected_version: u64,
) -> Result<Task, AppError> {
    tasks_update_impl(&state, space_id, id, patch, expected_version)
}

pub fn tasks_change_status_impl(
    state: &AppState,
    space_id: String,
    id: String,
    status: TaskStatus,
    expected_version: u64,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.change_status")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let current = tasks::get(&space_dir, &id)?;
    ensure_visible(&root, &session, &current)?;
    tasks::change_status(&space_dir, &id, status, expected_version)
}

#[write_command(rename = "tasksChangeStatus")]
pub fn tasks_change_status(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
    status: TaskStatus,
    expected_version: u64,
) -> Result<Task, AppError> {
    tasks_change_status_impl(&state, space_id, id, status, expected_version)
}

pub fn tasks_delete_impl(
    state: &AppState,
    space_id: String,
    id: String,
) -> Result<(), AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.delete")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    let task = tasks::get(&space_dir, &id)?;
    ensure_visible(&root, &session, &task)?;
    tasks::delete(&space_dir, &id)
}

#[write_command(rename = "tasksDelete")]
pub fn tasks_delete(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
) -> Result<(), AppError> {
    tasks_delete_impl(&state, space_id, id)
}

pub fn tasks_move_impl(
    state: &AppState,
    task_id: String,
    from_space_id: String,
    to_space_id: String,
) -> Result<Task, AppError> {
    state.require_writable()?;
    let session = state.require_perm("task.edit")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &from_space_id, &session)?;
    crate::spaces::require_access(&root, &to_space_id, &session)?;
    if from_space_id == to_space_id {
        return Err(AppError::new(
            "INVALID_INPUT",
            "source and target spaces must differ",
        ));
    }
    let from_dir = crate::spaces::space_dir(&root, &from_space_id)?;
    let to_dir = crate::spaces::space_dir(&root, &to_space_id)?;
    let mut task = tasks::get(&from_dir, &task_id)?;
    task.updated_at = crate::audit::now_rfc3339();
    task.space_id = None;
    task.space_name = None;
    tasks::save(&to_dir, &task)?;
    tasks::delete(&from_dir, &task_id)?;
    Ok(task)
}

#[write_command(rename = "tasksMove")]
pub fn tasks_move(
    state: State<'_, AppState>,
    task_id: String,
    from_space_id: String,
    to_space_id: String,
) -> Result<Task, AppError> {
    tasks_move_impl(&state, task_id, from_space_id, to_space_id)
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

    const SPACE: &str = "default";

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
        let space = crate::spaces::Space {
            id: SPACE.to_string(),
            name: "Основное".to_string(),
            description: String::new(),
            created_at: crate::audit::now_rfc3339(),
            owner_id: admin.id.clone(),
            members: vec![admin.id.clone(), executor.id.clone(), observer.id.clone()],
        };
        crate::spaces::write_space(dir.path(), &space).unwrap();
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
        tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({
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

        let listed = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter::default()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, task.id);

        let fetched = tasks_get_impl(&fx.state, SPACE.to_string(), task.id.clone()).unwrap();
        assert_eq!(fetched.title, "First");
    }

    #[test]
    fn update_increments_version() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        let updated = tasks_update_impl(&fx.state, SPACE.to_string(), task.id.clone(),
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
        let err = tasks_update_impl(&fx.state, SPACE.to_string(), task.id.clone(),
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
        tasks_delete_impl(&fx.state, SPACE.to_string(), task.id.clone()).unwrap();
        assert_eq!(
            tasks_get_impl(&fx.state, SPACE.to_string(), task.id).unwrap_err().code,
            "NOT_FOUND"
        );
    }

    #[test]
    fn executor_cannot_delete() {
        let fx = fixture();
        let task = create_task(&fx, "Assigned", &[&fx.executor.id]);
        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let err = tasks_delete_impl(&fx.state, SPACE.to_string(), task.id).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn executor_sees_only_own_tasks() {
        let fx = fixture();
        let mine = create_task(&fx, "Mine", &[&fx.executor.id]);
        let other = create_task(&fx, "Other", &[]);

        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let listed = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter::default()).unwrap();
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
        let err = tasks_get_impl(&fx.state, SPACE.to_string(), hidden.id).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn executor_change_status_hidden_forbidden() {
        let fx = fixture();
        let hidden = create_task(&fx, "Hidden", &[]);
        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let err =
            tasks_change_status_impl(&fx.state, SPACE.to_string(), hidden.id, TaskStatus::InProgress, 1).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn observer_cannot_create() {
        let fx = fixture();
        fx.state
            .set_session(session_for(&fx.observer.id, "observer"));
        let err = tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({ "title": "Nope" })),
        )
        .unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn change_status_increments_and_conflicts() {
        let fx = fixture();
        let task = create_task(&fx, "First", &[]);
        let changed =
            tasks_change_status_impl(&fx.state, SPACE.to_string(), task.id.clone(), TaskStatus::InProgress, 1).unwrap();
        assert_eq!(changed.status, TaskStatus::InProgress);
        assert_eq!(changed.version, 2);

        let err =
            tasks_change_status_impl(&fx.state, SPACE.to_string(), task.id, TaskStatus::Done, 1).unwrap_err();
        assert_eq!(err.code, "VERSION_CONFLICT");
        let current: Task = serde_json::from_str(err.details.as_deref().unwrap()).unwrap();
        assert_eq!(current.version, 2);
        assert_eq!(current.status, TaskStatus::InProgress);
    }

    #[test]
    fn list_filters_by_status_assignee_and_project() {
        let fx = fixture();
        let first = tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({
                "title": "A",
                "status": "in_progress",
                "assignees": [fx.executor.id],
                "projectId": "p1",
            })),
        )
        .unwrap();
        let second = tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({ "title": "B", "projectId": "p2" })),
        )
        .unwrap();

        let by_status = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter {
                status: Some(TaskStatus::InProgress),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_status.len(), 1);
        assert_eq!(by_status[0].id, first.id);

        let by_assignee = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter {
                assignee_id: Some(fx.executor.id.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_assignee.len(), 1);
        assert_eq!(by_assignee[0].id, first.id);

        let by_project = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter {
                project_id: Some("p2".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(by_project.len(), 1);
        assert_eq!(by_project[0].id, second.id);
    }

    #[test]
    fn list_filters_by_date_range() {
        let fx = fixture();
        let first = tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({ "title": "A", "dueDate": "2026-10-15" })),
        )
        .unwrap();
        let second = tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({ "title": "B", "dueDate": "2026-10-20" })),
        )
        .unwrap();
        tasks_create_impl(&fx.state, SPACE.to_string(), create_payload(json!({ "title": "C" }))).unwrap();

        let in_range = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter {
                start_date: Some("2026-10-10".to_string()),
                end_date: Some("2026-10-18".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(in_range.len(), 1);
        assert_eq!(in_range[0].id, first.id);

        let unscheduled = tasks_list_impl(&fx.state, SPACE.to_string(), TaskFilter {
                start_date: Some("2026-01-01".to_string()),
                end_date: Some("2026-12-31".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        // A wide range includes both dated tasks but never an unscheduled one.
        assert!(unscheduled.iter().any(|t| t.id == first.id));
        assert!(unscheduled.iter().any(|t| t.id == second.id));
        assert!(!unscheduled.iter().any(|t| t.title == "C"));
    }

    #[test]
    fn list_filters_unscheduled_tasks() {
        let fx = fixture();
        let scheduled = tasks_create_impl(
            &fx.state,
            SPACE.to_string(),
            create_payload(json!({ "title": "Dated", "dueDate": "2026-10-15" })),
        )
        .unwrap();
        let undated = tasks_create_impl(
            &fx.state,
            SPACE.to_string(),
            create_payload(json!({ "title": "Undated" })),
        )
        .unwrap();

        let only_unscheduled = tasks_list_impl(
            &fx.state,
            SPACE.to_string(),
            TaskFilter {
                has_due_date: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(only_unscheduled.len(), 1);
        assert_eq!(only_unscheduled[0].id, undated.id);

        let only_scheduled = tasks_list_impl(
            &fx.state,
            SPACE.to_string(),
            TaskFilter {
                has_due_date: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(only_scheduled.len(), 1);
        assert_eq!(only_scheduled[0].id, scheduled.id);
    }

    #[test]
    fn rejects_assignees_outside_the_space() {
        let fx = fixture();
        let outsider = users::create(
            fx._dir.path(),
            "outsider",
            "password123",
            "Outsider",
            "executor",
            None,
        )
        .unwrap();

        // Creating a task with a non-member assignee fails.
        assert_eq!(
            tasks_create_impl(
                &fx.state,
                SPACE.to_string(),
                create_payload(json!({
                    "title": "Nope",
                    "assignees": [outsider.id],
                })),
            )
            .unwrap_err()
            .code,
            "INVALID_ASSIGNEE"
        );

        // Adding a non-member during an update fails too.
        let task = create_task(&fx, "Valid", &[&fx.executor.id]);
        let patch = update_payload(json!({
            "assignees": [fx.executor.id, outsider.id],
        }));
        assert_eq!(
            tasks_update_impl(
                &fx.state,
                SPACE.to_string(),
                task.id.clone(),
                patch,
                task.version,
            )
            .unwrap_err()
            .code,
            "INVALID_ASSIGNEE"
        );

        // Keeping the existing assignee list (no new ids) still works.
        let patch = update_payload(json!({
            "assignees": [fx.executor.id],
            "title": "Renamed",
        }));
        let updated = tasks_update_impl(
            &fx.state,
            SPACE.to_string(),
            task.id,
            patch,
            task.version,
        )
        .unwrap();
        assert_eq!(updated.title, "Renamed");
    }
}
