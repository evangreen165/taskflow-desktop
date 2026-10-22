use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;
use crate::spaces::Space;
use crate::tasks::Task;
use crate::users::{self, UserInfo};

/// Keep per-user notification files bounded.
pub const MAX_PER_USER: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    TaskAssigned,
    CommentMention,
    SpaceAdded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    #[serde(rename = "type")]
    pub kind: NotificationType,
    pub title: String,
    pub message: String,
    #[serde(default)]
    pub link_to: Option<String>,
    #[serde(default)]
    pub is_read: bool,
    pub created_at: String,
}

fn notifications_dir(root: &Path) -> PathBuf {
    root.join("notifications")
}

fn user_file(root: &Path, user_id: &str) -> Result<PathBuf, AppError> {
    let valid = !user_id.is_empty()
        && user_id.len() <= 64
        && user_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(AppError::new("INVALID_INPUT", "invalid user id"));
    }
    Ok(notifications_dir(root).join(format!("{user_id}.json")))
}

/// Current user's notifications, newest first.
pub fn list(root: &Path, user_id: &str) -> Result<Vec<Notification>, AppError> {
    let path = user_file(root, user_id)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let mut items: Vec<Notification> = fsops::read_json(&path)?;
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    Ok(items)
}

pub fn push(root: &Path, notification: Notification) -> Result<(), AppError> {
    let path = user_file(root, &notification.user_id)?;
    let mut items: Vec<Notification> = if path.is_file() {
        fsops::read_json(&path)?
    } else {
        Vec::new()
    };
    items.insert(0, notification);
    items.truncate(MAX_PER_USER);
    fsops::write_json_atomic(&path, &items)
}

/// Marks one notification as read. Unknown ids are a no-op.
pub fn mark_read(root: &Path, user_id: &str, id: &str) -> Result<(), AppError> {
    let path = user_file(root, user_id)?;
    if !path.is_file() {
        return Ok(());
    }
    let mut items: Vec<Notification> = fsops::read_json(&path)?;
    let mut changed = false;
    for item in &mut items {
        if item.id == id && !item.is_read {
            item.is_read = true;
            changed = true;
        }
    }
    if changed {
        fsops::write_json_atomic(&path, &items)?;
    }
    Ok(())
}

pub fn mark_all_read(root: &Path, user_id: &str) -> Result<(), AppError> {
    let path = user_file(root, user_id)?;
    if !path.is_file() {
        return Ok(());
    }
    let mut items: Vec<Notification> = fsops::read_json(&path)?;
    let mut changed = false;
    for item in &mut items {
        if !item.is_read {
            item.is_read = true;
            changed = true;
        }
    }
    if changed {
        fsops::write_json_atomic(&path, &items)?;
    }
    Ok(())
}

pub fn new_notification(
    user_id: &str,
    kind: NotificationType,
    title: &str,
    message: &str,
    link_to: Option<String>,
) -> Notification {
    Notification {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.to_string(),
        kind,
        title: title.to_string(),
        message: message.to_string(),
        link_to,
        is_read: false,
        created_at: now_rfc3339(),
    }
}

fn task_link(space_id: &str, task_id: &str) -> String {
    format!("/app/tasks?task={task_id}&space={space_id}")
}

fn notify_assignees(
    root: &Path,
    actor_id: &str,
    space_id: &str,
    previous: &[String],
    task: &Task,
) -> Result<(), AppError> {
    let link = task_link(space_id, &task.id);
    for assignee in &task.assignees {
        if assignee == actor_id || previous.iter().any(|id| id == assignee) {
            continue;
        }
        push(
            root,
            new_notification(
                assignee,
                NotificationType::TaskAssigned,
                "Вам назначена задача",
                &task.title,
                Some(link.clone()),
            ),
        )?;
    }
    Ok(())
}

/// Tries the token as-is, then progressively drops trailing dots so that
/// `@bob.` at the end of a sentence still resolves to the login `bob`.
fn resolve_mention<'a>(users: &'a [UserInfo], raw: &str) -> Option<&'a UserInfo> {
    let mut candidate: String = raw
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        .collect();
    while !candidate.is_empty() {
        if let Some(user) = users
            .iter()
            .find(|u| u.is_active && u.login.eq_ignore_ascii_case(&candidate))
        {
            return Some(user);
        }
        if candidate.ends_with('.') {
            candidate.pop();
        } else {
            break;
        }
    }
    None
}

fn collect_mentions(users: &[UserInfo], out: &mut BTreeSet<String>, text: &str) {
    for token in text.split_whitespace() {
        // Scan for `@` anywhere in the token so `(@bob)` and `,@bob` work too.
        let mut cursor = token;
        while let Some(at) = cursor.find('@') {
            let candidate = &cursor[at + 1..];
            if let Some(user) = resolve_mention(users, candidate) {
                out.insert(user.id.clone());
            }
            cursor = candidate;
        }
    }
}

/// Notifies every assignee of a freshly created task (except the author).
pub fn on_task_created(
    root: &Path,
    actor_id: &str,
    space_id: &str,
    task: &Task,
) -> Result<(), AppError> {
    notify_assignees(root, actor_id, space_id, &[], task)
}

/// Notifies newly added assignees and users mentioned in comments added by the
/// actor. Best-effort: callers log failures instead of failing the write.
pub fn on_task_updated(
    root: &Path,
    actor_id: &str,
    space_id: &str,
    previous: &Task,
    task: &Task,
) -> Result<(), AppError> {
    notify_assignees(root, actor_id, space_id, &previous.assignees, task)?;

    let new_comments: Vec<&crate::tasks::Comment> = task
        .comments
        .iter()
        .filter(|comment| {
            comment.author_id == actor_id
                && !previous
                    .comments
                    .iter()
                    .any(|old| old.id == comment.id)
        })
        .collect();
    if new_comments.is_empty() {
        return Ok(());
    }

    let users = users::list(root)?;
    let mut mentioned = BTreeSet::new();
    for comment in new_comments {
        collect_mentions(&users, &mut mentioned, &comment.text);
    }

    let link = task_link(space_id, &task.id);
    for user_id in mentioned {
        if user_id == actor_id {
            continue;
        }
        push(
            root,
            new_notification(
                &user_id,
                NotificationType::CommentMention,
                "Упоминание в комментарии",
                &format!("Вас упомянули в задаче «{}»", task.title),
                Some(link.clone()),
            ),
        )?;
    }
    Ok(())
}

/// Notifies users added to a space (except the actor).
pub fn on_space_updated(
    root: &Path,
    actor_id: &str,
    previous: &Space,
    space: &Space,
) -> Result<(), AppError> {
    let link = Some(format!("/app/dashboard?space={}", space.id));
    for member in &space.members {
        if member == actor_id || previous.members.iter().any(|id| id == member) {
            continue;
        }
        push(
            root,
            new_notification(
                member,
                NotificationType::SpaceAdded,
                "Новое пространство",
                &format!("Вас добавили в пространство «{}»", space.name),
                link.clone(),
            ),
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn note(user_id: &str, title: &str) -> Notification {
        new_notification(user_id, NotificationType::TaskAssigned, "T", title, None)
    }

    #[test]
    fn push_list_and_cap() {
        let dir = tempdir().unwrap();
        for index in 0..(MAX_PER_USER + 5) {
            let mut item = note("u1", &format!("n{index}"));
            // Distinct timestamps keep the newest-first assertion deterministic.
            item.created_at = format!("2026-10-22T{:02}:{:02}:00Z", index / 60, index % 60);
            push(dir.path(), item).unwrap();
        }
        let items = list(dir.path(), "u1").unwrap();
        assert_eq!(items.len(), MAX_PER_USER);
        // Newest first.
        assert_eq!(items[0].message, format!("n{}", MAX_PER_USER + 4));
    }

    #[test]
    fn mark_read_and_mark_all_read() {
        let dir = tempdir().unwrap();
        let first = note("u1", "first");
        let first_id = first.id.clone();
        push(dir.path(), first).unwrap();
        push(dir.path(), note("u1", "second")).unwrap();

        mark_read(dir.path(), "u1", &first_id).unwrap();
        let items = list(dir.path(), "u1").unwrap();
        assert!(items.iter().find(|n| n.id == first_id).unwrap().is_read);

        mark_all_read(dir.path(), "u1").unwrap();
        assert!(list(dir.path(), "u1").unwrap().iter().all(|n| n.is_read));
    }

    #[test]
    fn files_are_per_user_and_ids_are_validated() {
        let dir = tempdir().unwrap();
        push(dir.path(), note("u1", "one")).unwrap();
        push(dir.path(), note("u2", "two")).unwrap();
        assert_eq!(list(dir.path(), "u1").unwrap().len(), 1);
        assert_eq!(list(dir.path(), "u2").unwrap().len(), 1);
        assert_eq!(
            list(dir.path(), "../evil").unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn mentions_parse_trailing_punctuation_and_dedupe() {
        let users = vec![
            UserInfo {
                id: "id-bob".to_string(),
                login: "bob".to_string(),
                display_name: "Bob".to_string(),
                email: None,
                role_id: "executor".to_string(),
                avatar_color: "#000000".to_string(),
                avatar_sha256: None,
                created_at: String::new(),
                last_login_at: None,
                is_active: true,
                must_change_password: false,
            },
            UserInfo {
                id: "id-alice".to_string(),
                login: "alice".to_string(),
                display_name: "Alice".to_string(),
                email: None,
                role_id: "executor".to_string(),
                avatar_color: "#000000".to_string(),
                avatar_sha256: None,
                created_at: String::new(),
                last_login_at: None,
                is_active: true,
                must_change_password: false,
            },
        ];
        let mut out = BTreeSet::new();
        collect_mentions(&users, &mut out, "Hi @bob, ping (@alice). @bob again");
        assert_eq!(
            out.into_iter().collect::<Vec<_>>(),
            vec!["id-alice".to_string(), "id-bob".to_string()]
        );
    }
}
