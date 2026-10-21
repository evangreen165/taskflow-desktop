use tauri::State;

use taskflow_macros::write_command;

use crate::error::AppError;
use crate::spaces::{self, Space};
use crate::AppState;

pub fn spaces_list_impl(state: &AppState) -> Result<Vec<Space>, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    let all = spaces::list(&root)?;
    Ok(if spaces::is_admin(&session) {
        all
    } else {
        all.into_iter()
            .filter(|space| spaces::is_member(space, &session.user_id))
            .collect()
    })
}

#[tauri::command(rename = "spacesList")]
pub fn spaces_list(state: State<'_, AppState>) -> Result<Vec<Space>, AppError> {
    spaces_list_impl(&state)
}

pub fn spaces_get_impl(state: &AppState, id: String) -> Result<Space, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    spaces::require_access(&root, &id, &session)
}

#[tauri::command(rename = "spacesGet")]
pub fn spaces_get(state: State<'_, AppState>, id: String) -> Result<Space, AppError> {
    spaces_get_impl(&state, id)
}

pub fn spaces_create_impl(
    state: &AppState,
    name: String,
    description: String,
) -> Result<Space, AppError> {
    state.require_writable()?;
    let session = state.require_perm("space.create")?;
    spaces::create(&state.root()?, &session.user_id, &name, &description)
}

#[write_command(rename = "spacesCreate")]
pub fn spaces_create(
    state: State<'_, AppState>,
    name: String,
    description: String,
) -> Result<Space, AppError> {
    spaces_create_impl(&state, name, description)
}

pub fn spaces_update_impl(
    state: &AppState,
    id: String,
    name: String,
    description: String,
    members: Vec<String>,
) -> Result<Space, AppError> {
    state.require_writable()?;
    let session = state.require_auth()?;
    let root = state.root()?;
    let space = spaces::get(&root, &id)?;
    if !spaces::is_admin(&session) && space.owner_id != session.user_id {
        return Err(AppError::new(
            "FORBIDDEN",
            "only the space owner or an administrator can update it",
        ));
    }
    spaces::update(&root, &id, &name, &description, members)
}

#[write_command(rename = "spacesUpdate")]
pub fn spaces_update(
    state: State<'_, AppState>,
    id: String,
    name: String,
    description: String,
    members: Vec<String>,
) -> Result<Space, AppError> {
    spaces_update_impl(&state, id, name, description, members)
}

pub fn spaces_delete_impl(state: &AppState, id: String) -> Result<(), AppError> {
    state.require_writable()?;
    let session = state.require_auth()?;
    let root = state.root()?;
    let space = spaces::get(&root, &id)?;
    if !spaces::is_admin(&session) && space.owner_id != session.user_id {
        return Err(AppError::new(
            "FORBIDDEN",
            "only the space owner or an administrator can delete it",
        ));
    }
    spaces::delete(&root, &id)
}

#[write_command(rename = "spacesDelete")]
pub fn spaces_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    spaces_delete_impl(&state, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{tasks_create_impl, tasks_list_impl};
    use crate::session::Session;
    use crate::tasks::{CreateTaskPayload, TaskFilter};
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use serde_json::json;
    use tempfile::tempdir;

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        user_a: UserInfo,
        user_b: UserInfo,
        space_a: String,
        space_b: String,
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

    fn create_payload(value: serde_json::Value) -> CreateTaskPayload {
        serde_json::from_value(value).unwrap()
    }

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Spaces").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let user_a =
            users::create(dir.path(), "alice", "password123", "Alice", "manager", None).unwrap();
        let user_b =
            users::create(dir.path(), "bob", "password123", "Bob", "manager", None).unwrap();
        let space_a = crate::spaces::create(dir.path(), &user_a.id, "Alpha", "").unwrap();
        let space_b = crate::spaces::create(dir.path(), &user_b.id, "Beta", "").unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&user_a.id, "manager"));
        Fixture {
            _dir: dir,
            state,
            admin,
            user_a,
            user_b,
            space_a: space_a.id,
            space_b: space_b.id,
        }
    }

    #[test]
    fn create_space_sets_owner_and_membership() {
        let fx = fixture();
        let space =
            spaces_create_impl(&fx.state, "Gamma".to_string(), "desc".to_string()).unwrap();
        assert_eq!(space.owner_id, fx.user_a.id);
        assert_eq!(space.members, vec![fx.user_a.id.clone()]);
        assert!(fx
            ._dir
            .path()
            .join("spaces")
            .join(&space.id)
            .join("space.json")
            .is_file());
    }

    #[test]
    fn spaces_list_is_scoped_to_membership() {
        let fx = fixture();
        let listed = spaces_list_impl(&fx.state).unwrap();
        assert!(listed.iter().any(|s| s.id == fx.space_a));
        assert!(!listed.iter().any(|s| s.id == fx.space_b));
        // Alice also has her auto-created personal space.
        assert!(listed.iter().any(|s| crate::spaces::is_personal(&s.id)));

        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        // 3 personal spaces (admin/alice/bob) + Alpha + Beta.
        assert_eq!(spaces_list_impl(&fx.state).unwrap().len(), 5);
    }

    #[test]
    fn spaces_are_isolated_and_foreign_writes_are_forbidden() {
        let fx = fixture();

        let task = tasks_create_impl(
            &fx.state,
            fx.space_a.clone(),
            create_payload(json!({ "title": "A task" })),
        )
        .unwrap();

        // userA cannot read or write spaceB.
        assert_eq!(
            tasks_list_impl(&fx.state, fx.space_b.clone(), TaskFilter::default())
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );
        assert_eq!(
            tasks_create_impl(
                &fx.state,
                fx.space_b.clone(),
                create_payload(json!({ "title": "X" }))
            )
            .unwrap_err()
            .code,
            "FORBIDDEN"
        );

        // userB cannot see spaceA, and sees an empty spaceB.
        fx.state.set_session(session_for(&fx.user_b.id, "manager"));
        assert_eq!(
            tasks_list_impl(&fx.state, fx.space_a.clone(), TaskFilter::default())
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );
        assert!(tasks_list_impl(&fx.state, fx.space_b.clone(), TaskFilter::default())
            .unwrap()
            .is_empty());

        // Admin can read spaceA and sees the task.
        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        let listed = tasks_list_impl(&fx.state, fx.space_a.clone(), TaskFilter::default()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, task.id);
    }

    #[test]
    fn update_and_delete_require_owner_or_admin() {
        let fx = fixture();

        fx.state.set_session(session_for(&fx.user_b.id, "manager"));
        assert_eq!(
            spaces_update_impl(
                &fx.state,
                fx.space_a.clone(),
                "X".to_string(),
                String::new(),
                vec![],
            )
            .unwrap_err()
            .code,
            "FORBIDDEN"
        );
        assert_eq!(
            spaces_delete_impl(&fx.state, fx.space_a.clone())
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );

        fx.state.set_session(session_for(&fx.user_a.id, "manager"));
        let updated = spaces_update_impl(
            &fx.state,
            fx.space_a.clone(),
            "Alpha2".to_string(),
            "d".to_string(),
            vec![fx.user_b.id.clone()],
        )
        .unwrap();
        assert_eq!(updated.name, "Alpha2");
        assert!(updated.members.contains(&fx.user_b.id));

        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        spaces_delete_impl(&fx.state, fx.space_a.clone()).unwrap();
        assert!(crate::spaces::get(fx._dir.path(), &fx.space_a).is_err());
    }
}
