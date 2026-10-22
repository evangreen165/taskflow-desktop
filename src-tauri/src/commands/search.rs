use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::notes::{self, NoteStatus};
use crate::roles;
use crate::session::Session;
use crate::spaces;
use crate::tasks::{self, TaskPriority, TaskStatus};
use crate::AppState;

/// Maximum number of results per category returned by `globalSearch`.
const SEARCH_LIMIT: usize = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSearchResult {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub space_id: String,
    pub space_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchResult {
    pub id: String,
    pub title: String,
    pub category: String,
    pub status: NoteStatus,
    pub space_id: String,
    pub space_name: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchResults {
    pub tasks: Vec<TaskSearchResult>,
    pub notes: Vec<NoteSearchResult>,
}

fn has_perm(root: &Path, session: &Session, perm: &str) -> Result<bool, AppError> {
    Ok(roles::permissions_for(root, &session.role_id)?
        .iter()
        .any(|p| p == perm))
}

/// Case-insensitive substring test. `needle` must already be lowercased.
fn contains(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(needle)
}

/// Searches tasks (title/description) and notes (title/content) across the
/// spaces the session may access. A non-admin only sees spaces they belong to;
/// `space_id` narrows the search to one space (and is access-checked).
///
/// Task visibility (`task.view_all` vs author/assignee) and the personal-space
/// owner bypass for notes are respected, so search never reveals data the
/// corresponding list commands would hide.
pub fn global_search_impl(
    state: &AppState,
    query: String,
    space_id: Option<String>,
) -> Result<GlobalSearchResults, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(GlobalSearchResults::default());
    }

    let all_spaces = spaces::list(&root)?;
    let admin = spaces::is_admin(&session);
    let selected = match space_id {
        Some(id) => {
            let space = all_spaces
                .iter()
                .find(|space| space.id == id)
                .cloned()
                .ok_or_else(|| {
                    AppError::new("NOT_FOUND", format!("space '{id}' does not exist"))
                })?;
            if !admin && !spaces::is_member(&space, &session.user_id) {
                return Err(AppError::new("FORBIDDEN", "no access to this space"));
            }
            vec![space]
        }
        None => all_spaces
            .into_iter()
            .filter(|space| admin || spaces::is_member(space, &session.user_id))
            .collect(),
    };

    let can_view_tasks = has_perm(&root, &session, "task.view")?;
    let view_all_tasks = has_perm(&root, &session, "task.view_all")?;
    let can_view_notes = has_perm(&root, &session, "article.view")?;

    let mut results = GlobalSearchResults::default();
    for space in selected {
        let Ok(space_dir) = spaces::space_dir(&root, &space.id) else {
            continue;
        };

        if can_view_tasks && results.tasks.len() < SEARCH_LIMIT {
            for task in tasks::list(&space_dir)? {
                if results.tasks.len() >= SEARCH_LIMIT {
                    break;
                }
                let visible = view_all_tasks
                    || task.author_id == session.user_id
                    || task.assignees.iter().any(|a| a == &session.user_id);
                if !visible {
                    continue;
                }
                if !contains(&task.title, &needle) && !contains(&task.description, &needle) {
                    continue;
                }
                results.tasks.push(TaskSearchResult {
                    id: task.id,
                    title: task.title,
                    status: task.status,
                    priority: task.priority,
                    due_date: task.due_date,
                    space_id: space.id.clone(),
                    space_name: space.name.clone(),
                });
            }
        }

        let personal_owner = spaces::is_personal_owner(&root, &space.id, &session.user_id)?;
        if (can_view_notes || personal_owner) && results.notes.len() < SEARCH_LIMIT {
            for meta in notes::list_meta(&space_dir)? {
                if results.notes.len() >= SEARCH_LIMIT {
                    break;
                }
                let title_hit = contains(&meta.title, &needle);
                let content_hit = if title_hit {
                    false
                } else {
                    notes::read_content(&space_dir, &meta.id)
                        .map(|content| contains(&content, &needle))
                        .unwrap_or(false)
                };
                if !title_hit && !content_hit {
                    continue;
                }
                results.notes.push(NoteSearchResult {
                    id: meta.id,
                    title: meta.title,
                    category: meta.category,
                    status: meta.status,
                    space_id: space.id.clone(),
                    space_name: space.name.clone(),
                });
            }
        }
    }

    Ok(results)
}

#[tauri::command(rename = "globalSearch")]
pub fn global_search(
    state: State<'_, AppState>,
    query: String,
    space_id: Option<String>,
) -> Result<GlobalSearchResults, AppError> {
    global_search_impl(&state, query, space_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::tasks::CreateTaskPayload;
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use tempfile::tempdir;

    const SPACE: &str = "default";

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        executor: UserInfo,
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
        let info = workspace::init(dir.path(), "Search").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "Executor", "executor", None).unwrap();
        let space = spaces::Space {
            id: SPACE.to_string(),
            name: "Основное".to_string(),
            description: String::new(),
            created_at: crate::audit::now_rfc3339(),
            owner_id: admin.id.clone(),
            members: vec![admin.id.clone(), executor.id.clone()],
        };
        spaces::write_space(dir.path(), &space).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        Fixture {
            _dir: dir,
            state,
            admin,
            executor,
        }
    }

    fn create_task(fx: &Fixture, title: &str, description: &str, assignee: &str) {
        let payload: CreateTaskPayload = serde_json::from_value(serde_json::json!({
            "title": title,
            "description": description,
            "assignees": [assignee],
        }))
        .unwrap();
        crate::commands::tasks_create_impl(&fx.state, SPACE.to_string(), payload).unwrap();
    }

    fn create_note(fx: &Fixture, title: &str, content: &str) {
        crate::commands::notes_create_impl(
            &fx.state,
            SPACE.to_string(),
            title.to_string(),
            "Процессы".to_string(),
            content.to_string(),
        )
        .unwrap();
    }

    #[test]
    fn finds_tasks_by_title_and_description() {
        let fx = fixture();
        create_task(&fx, "Fix login", "auth page", &fx.executor.id);
        create_task(&fx, "Write docs", "document the login flow", &fx.executor.id);
        create_task(&fx, "Unrelated", "nothing here", &fx.executor.id);

        let results = global_search_impl(&fx.state, "login".to_string(), None).unwrap();
        assert_eq!(results.tasks.len(), 2);
        assert!(results.tasks.iter().any(|t| t.title == "Fix login"));
        assert!(results.tasks.iter().any(|t| t.title == "Write docs"));
        assert!(results.tasks.iter().all(|t| t.space_id == SPACE));
    }

    #[test]
    fn finds_notes_by_title_and_content() {
        let fx = fixture();
        create_note(&fx, "Onboarding", "welcome aboard");
        create_note(&fx, "Handbook", "the onboarding process is described here");
        create_note(&fx, "Unrelated", "nothing");

        let results = global_search_impl(&fx.state, "onboarding".to_string(), None).unwrap();
        assert_eq!(results.notes.len(), 2);
        assert!(results.notes.iter().any(|n| n.title == "Onboarding"));
        assert!(results.notes.iter().any(|n| n.title == "Handbook"));
    }

    #[test]
    fn empty_query_returns_nothing() {
        let fx = fixture();
        create_task(&fx, "Fix login", "", &fx.executor.id);
        let results = global_search_impl(&fx.state, "   ".to_string(), None).unwrap();
        assert!(results.tasks.is_empty());
        assert!(results.notes.is_empty());
    }

    #[test]
    fn non_admin_cannot_search_foreign_spaces() {
        let fx = fixture();
        let other = spaces::create(fx._dir.path(), &fx.admin.id, "Other", "").unwrap();
        // A note and a task that live in a space the executor does not belong to.
        let payload: CreateTaskPayload =
            serde_json::from_value(serde_json::json!({ "title": "Secret task" })).unwrap();
        crate::commands::tasks_create_impl(&fx.state, other.id.clone(), payload).unwrap();
        crate::commands::notes_create_impl(
            &fx.state,
            other.id.clone(),
            "Secret note".to_string(),
            "X".to_string(),
            "secret".to_string(),
        )
        .unwrap();

        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let results = global_search_impl(&fx.state, "secret".to_string(), None).unwrap();
        assert!(results.tasks.is_empty());
        assert!(results.notes.is_empty());

        // Explicitly asking for a foreign space is forbidden.
        assert_eq!(
            global_search_impl(&fx.state, "secret".to_string(), Some(other.id.clone()))
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );

        // Admins see every space.
        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        let results = global_search_impl(&fx.state, "secret".to_string(), None).unwrap();
        assert_eq!(results.tasks.len(), 1);
        assert_eq!(results.notes.len(), 1);
    }

    #[test]
    fn space_filter_limits_results() {
        let fx = fixture();
        create_note(&fx, "Alpha note", "body");
        let other = spaces::create(fx._dir.path(), &fx.admin.id, "Other", "").unwrap();
        crate::commands::notes_create_impl(
            &fx.state,
            other.id.clone(),
            "Alpha elsewhere".to_string(),
            "X".to_string(),
            "body".to_string(),
        )
        .unwrap();

        let scoped = global_search_impl(&fx.state, "alpha".to_string(), Some(SPACE.to_string()))
            .unwrap();
        assert_eq!(scoped.notes.len(), 1);
        assert_eq!(scoped.notes[0].space_id, SPACE);
    }

    #[test]
    fn results_are_limited() {
        let fx = fixture();
        for index in 0..15 {
            create_task(&fx, &format!("Task {index}"), "common", &fx.executor.id);
            create_note(&fx, &format!("Note {index}"), "common");
        }
        let results = global_search_impl(&fx.state, "common".to_string(), None).unwrap();
        assert_eq!(results.tasks.len(), SEARCH_LIMIT);
        assert_eq!(results.notes.len(), SEARCH_LIMIT);
    }

    #[test]
    fn executor_only_finds_visible_tasks() {
        let fx = fixture();
        // A task authored by the admin and not assigned to the executor.
        create_task(&fx, "Admin only", "hidden", &fx.admin.id);
        // A task assigned to the executor.
        create_task(&fx, "Mine", "visible", &fx.executor.id);

        fx.state
            .set_session(session_for(&fx.executor.id, "executor"));
        let results = global_search_impl(&fx.state, "i".to_string(), None).unwrap();
        assert!(results.tasks.iter().any(|t| t.title == "Mine"));
        assert!(!results.tasks.iter().any(|t| t.title == "Admin only"));
    }
}
