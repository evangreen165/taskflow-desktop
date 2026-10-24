use tauri::State;

use crate::error::AppError;
use crate::notifications::{self, Notification};
use crate::AppState;

#[cfg(test)]
pub fn notifications_list_impl(state: &AppState) -> Result<Vec<Notification>, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    notifications::list(&root, &session.user_id)
}

#[tauri::command(rename = "notificationsList")]
#[tracing::instrument(skip(state))]
pub async fn notifications_list(
    state: State<'_, AppState>,
) -> Result<Vec<Notification>, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    tokio::task::spawn_blocking(move || notifications::list(&root, &session.user_id))
        .await
        .map_err(|e| AppError::new("IO", format!("notifications list task failed: {e}")))?
}

pub fn notifications_mark_read_impl(state: &AppState, id: String) -> Result<(), AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    notifications::mark_read(&root, &session.user_id, &id)
}

#[tauri::command(rename = "notificationsMarkRead")]
pub fn notifications_mark_read(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    notifications_mark_read_impl(&state, id)
}

pub fn notifications_mark_all_read_impl(state: &AppState) -> Result<(), AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    notifications::mark_all_read(&root, &session.user_id)
}

#[tauri::command(rename = "notificationsMarkAllRead")]
pub fn notifications_mark_all_read(state: State<'_, AppState>) -> Result<(), AppError> {
    notifications_mark_all_read_impl(&state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{spaces_update_impl, tasks_create_impl, tasks_update_impl};
    use crate::notifications::NotificationType;
    use crate::session::Session;
    use crate::spaces::{self, Space};
    use crate::tasks::{CreateTaskPayload, UpdateTaskPayload};
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use tempfile::tempdir;

    const SPACE: &str = "default";

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        alice: UserInfo,
        bob: UserInfo,
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
            expires_at: None,
            role_missing_reported: false,
        }
    }

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Notifications").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let alice =
            users::create(dir.path(), "alice", "password123", "Alice", "executor", None).unwrap();
        let bob = users::create(dir.path(), "bob", "password123", "Bob", "executor", None).unwrap();
        let space = Space {
            id: SPACE.to_string(),
            name: "Основное".to_string(),
            description: String::new(),
            created_at: crate::audit::now_rfc3339(),
            owner_id: admin.id.clone(),
            members: vec![admin.id.clone(), alice.id.clone()],
        };
        spaces::write_space(dir.path(), &space).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        Fixture {
            _dir: dir,
            state,
            admin,
            alice,
            bob,
        }
    }

    fn create_task(fx: &Fixture, title: &str, assignees: &[&str]) -> crate::tasks::Task {
        let payload: CreateTaskPayload = serde_json::from_value(serde_json::json!({
            "title": title,
            "assignees": assignees,
        }))
        .unwrap();
        tasks_create_impl(&fx.state, SPACE.to_string(), payload).unwrap()
    }

    fn as_user(fx: &Fixture, user: &UserInfo) {
        fx.state
            .set_session(session_for(&user.id, "executor"));
    }

    #[test]
    fn task_creation_notifies_assignees_but_not_actor() {
        let fx = fixture();
        create_task(&fx, "Fix login", &[&fx.alice.id, &fx.admin.id]);

        as_user(&fx, &fx.alice);
        let alice = notifications_list_impl(&fx.state).unwrap();
        assert_eq!(alice.len(), 1);
        assert_eq!(alice[0].kind, NotificationType::TaskAssigned);
        assert!(!alice[0].is_read);
        assert!(alice[0]
            .link_to
            .as_deref()
            .unwrap()
            .starts_with("/app/tasks?task="));

        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        assert!(notifications_list_impl(&fx.state).unwrap().is_empty());
    }

    #[test]
    fn task_update_notifies_only_new_assignees() {
        let fx = fixture();
        // Bob must be a space member to be assignable (Stage 7.2b validation).
        let mut space = spaces::get(fx._dir.path(), SPACE).unwrap();
        space.members.push(fx.bob.id.clone());
        spaces::write_space(fx._dir.path(), &space).unwrap();

        let task = create_task(&fx, "Fix login", &[&fx.alice.id]);

        let patch: UpdateTaskPayload = serde_json::from_value(serde_json::json!({
            "assignees": [fx.alice.id, fx.bob.id],
        }))
        .unwrap();
        tasks_update_impl(
            &fx.state,
            SPACE.to_string(),
            task.id.clone(),
            patch,
            task.version,
        )
        .unwrap();

        as_user(&fx, &fx.bob);
        assert_eq!(notifications_list_impl(&fx.state).unwrap().len(), 1);
        as_user(&fx, &fx.alice);
        // Still exactly the creation notification.
        assert_eq!(notifications_list_impl(&fx.state).unwrap().len(), 1);
    }

    #[test]
    fn comment_mention_notifies_the_mentioned_user() {
        let fx = fixture();
        let task = create_task(&fx, "Review PR", &[]);

        let patch: UpdateTaskPayload = serde_json::from_value(serde_json::json!({
            "comments": [{
                "id": "c1",
                "authorId": fx.admin.id,
                "text": "@bob please review this",
                "createdAt": "2026-10-22T10:00:00Z",
            }],
        }))
        .unwrap();
        tasks_update_impl(
            &fx.state,
            SPACE.to_string(),
            task.id.clone(),
            patch,
            task.version,
        )
        .unwrap();

        as_user(&fx, &fx.bob);
        let bob = notifications_list_impl(&fx.state).unwrap();
        assert_eq!(bob.len(), 1);
        assert_eq!(bob[0].kind, NotificationType::CommentMention);
        assert!(bob[0].message.contains("Review PR"));
    }

    #[test]
    fn space_update_notifies_new_members() {
        let fx = fixture();
        spaces_update_impl(
            &fx.state,
            SPACE.to_string(),
            "Основное".to_string(),
            String::new(),
            vec![fx.admin.id.clone(), fx.alice.id.clone(), fx.bob.id.clone()],
        )
        .unwrap();

        as_user(&fx, &fx.bob);
        let bob = notifications_list_impl(&fx.state).unwrap();
        assert_eq!(bob.len(), 1);
        assert_eq!(bob[0].kind, NotificationType::SpaceAdded);
        assert!(bob[0].message.contains("Основное"));
    }

    #[test]
    fn mark_read_only_touches_the_current_users_file() {
        let fx = fixture();
        create_task(&fx, "Fix login", &[&fx.alice.id]);

        as_user(&fx, &fx.alice);
        let items = notifications_list_impl(&fx.state).unwrap();
        let id = items[0].id.clone();
        notifications_mark_read_impl(&fx.state, id.clone()).unwrap();
        let items = notifications_list_impl(&fx.state).unwrap();
        assert!(items[0].is_read);

        // Bob cannot mark Alice's notification: his file is untouched.
        as_user(&fx, &fx.bob);
        notifications_mark_read_impl(&fx.state, id).unwrap();
        assert!(notifications_list_impl(&fx.state).unwrap().is_empty());

        as_user(&fx, &fx.alice);
        notifications_mark_all_read_impl(&fx.state).unwrap();
        assert!(notifications_list_impl(&fx.state)
            .unwrap()
            .iter()
            .all(|n| n.is_read));
    }
}
