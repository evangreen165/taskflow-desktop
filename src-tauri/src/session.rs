use serde::{Serialize, Serializer};
use std::path::Path;

use crate::error::AppError;
use crate::roles;
use crate::users::{self, UserInfo};

/// In-memory session for the logged-in user.
#[derive(Debug, Clone)]
pub struct Session {
    pub user_id: String,
    pub login: String,
    pub display_name: String,
    pub role_id: String,
    pub avatar_color: String,
    pub must_change_password: bool,
    pub login_at: String,
    /// Unix seconds when the session expires. `None` = never (lifetime 0).
    pub expires_at: Option<i64>,
    /// Dedup flag: `role.missing` is emitted at most once per session.
    pub role_missing_reported: bool,
}

/// Role summary exposed over IPC (id, display name, color).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleView {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// What `authRefreshSession`/`session` return to the UI: the sanitized user,
/// the resolved role summary, the effective permission list, and session
/// metadata.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub user: UserInfo,
    pub role: RoleView,
    pub permissions: Vec<String>,
    pub login_at: String,
    pub must_change_password: bool,
}

/// Actor identity for the audit trail: a user id or a system reason.
/// Serializes as `u:{userId}` / `s:{reason}` (e.g. `s:init`, `s:migrate`).
#[derive(Debug, Clone)]
pub enum ActorId {
    User(String),
    System(&'static str),
}

impl ActorId {
    /// Serialized form: `u:{userId}` / `s:{reason}`.
    pub fn label(&self) -> String {
        match self {
            ActorId::User(id) => format!("u:{id}"),
            ActorId::System(reason) => format!("s:{reason}"),
        }
    }

    /// Entity id for audit events: the raw user id, or the system reason.
    pub fn id(&self) -> String {
        match self {
            ActorId::User(id) => id.clone(),
            ActorId::System(reason) => reason.to_string(),
        }
    }
}

impl Serialize for ActorId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.label())
    }
}

/// Builds the `SessionView` for an active session. Fails with `ROLE_NOT_FOUND`
/// when the session's role file is missing (never grants permissions).
pub fn view(root: &Path, session: &Session) -> Result<SessionView, AppError> {
    let user = users::find_by_id(root, &session.user_id)?;
    let role = roles::get(root, &session.role_id)?;
    let permissions = roles::permissions_for(root, &session.role_id)?;
    Ok(SessionView {
        user: UserInfo::from(&user),
        role: RoleView {
            id: role.id,
            name: role.name,
            color: role.color,
        },
        permissions,
        login_at: session.login_at.clone(),
        must_change_password: session.must_change_password,
    })
}
