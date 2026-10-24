use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::error::AppError;
use crate::fsops;
use crate::AppState;

/// One parsed audit entry from `audit/{yyyy-mm}.log` (JSONL).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub ts: String,
    pub user_id: String,
    pub action: String,
    pub entity: String,
    pub entity_id: String,
    pub meta: Value,
}

/// Paginated, filtered slice of the audit journal.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogPage {
    pub items: Vec<AuditEntry>,
    pub total: usize,
}

/// Reads every JSONL line of the `audit/{month}.log` files (newest month
/// first), newest entry first within a file.
fn read_all_entries(root: &Path) -> Vec<AuditEntry> {
    let audit_dir = root.join("audit");
    let mut months: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&audit_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".log") {
                months.push(name.trim_end_matches(".log").to_string());
            }
        }
    }
    months.sort();
    months.reverse();

    let mut out: Vec<AuditEntry> = Vec::new();
    for month in months {
        let path = audit_dir.join(format!("{month}.log"));
        let Ok(text) = fsops::read_text(&path) else { continue };
        let mut entries: Vec<AuditEntry> = text
            .lines()
            .filter_map(|line| serde_json::from_str(line.trim()).ok())
            .collect();
        // Newest first within the month.
        entries.sort_by(|a, b| b.ts.cmp(&a.ts));
        out.extend(entries);
    }
    out
}

fn login_lookup(root: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Ok(users) = crate::users::list(root) {
        for user in users {
            map.insert(user.id, user.login);
        }
    }
    map
}

/// Testable body of `auditGetLogs`.
pub fn audit_get_logs_impl(
    state: &AppState,
    limit: usize,
    offset: usize,
    user_filter: Option<String>,
    action_filter: Option<String>,
    date_filter: Option<String>,
) -> Result<AuditLogPage, AppError> {
    state.require_perm("audit.view")?;
    let root = state.root()?;

    let mut entries = read_all_entries(&root);
    let logins = login_lookup(&root);

    let user_filter = user_filter.map(|value| value.trim().to_lowercase()).filter(|v| !v.is_empty());
    let action_filter = action_filter.map(|value| value.trim().to_string()).filter(|v| !v.is_empty());
    let date_filter = date_filter.map(|value| value.trim().to_string()).filter(|v| !v.is_empty());

    if let Some(date) = &date_filter {
        // Keep only the matching month file(s) by scanning ts (ts is RFC3339,
        // so a YYYY-MM or YYYY-MM-DD prefix works for both whole-month and
        // single-day filters).
        let prefix = if date.len() >= 10 { &date[..10] } else { date.as_str() };
        entries.retain(|entry| entry.ts.starts_with(prefix));
    }
    if let Some(action) = &action_filter {
        entries.retain(|entry| &entry.action == action);
    }
    if let Some(user) = &user_filter {
        entries.retain(|entry| {
            let login = logins.get(entry.user_id.trim_start_matches("u:")).cloned().unwrap_or_default();
            entry.user_id.to_lowercase().contains(user) || login.to_lowercase().contains(user)
        });
    }

    let total = entries.len();
    let items: Vec<AuditEntry> = entries
        .into_iter()
        .skip(offset)
        .take(limit.max(1))
        .collect();

    Ok(AuditLogPage { items, total })
}

/// `auditGetLogs` — reads the workspace audit journal (JSONL monthly files)
/// and returns a filtered, paginated slice (newest first). Requires
/// `audit.view`.
///
/// Filters: `userFilter` matches the actor's login (or the raw actor label,
/// e.g. `s:init`), `actionFilter` is an exact action match, `dateFilter` is
/// `YYYY-MM` (whole month) or `YYYY-MM-DD` (single day).
#[tauri::command(rename = "auditGetLogs")]
pub fn audit_get_logs(
    state: State<'_, AppState>,
    limit: usize,
    offset: usize,
    user_filter: Option<String>,
    action_filter: Option<String>,
    date_filter: Option<String>,
) -> Result<AuditLogPage, AppError> {
    audit_get_logs_impl(&state, limit, offset, user_filter, action_filter, date_filter)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace;
    use tempfile::tempdir;

    fn seed(root: &Path) {
        crate::audit::append_audit(root, "u:alice", "auth.login", "user", "A", serde_json::json!({}))
            .unwrap();
        crate::audit::append_audit(root, "u:alice", "task.create", "task", "T-1", serde_json::json!({"title": "x"}))
            .unwrap();
        crate::audit::append_audit(root, "s:init", "workspace.create", "workspace", "W", serde_json::json!({}))
            .unwrap();
    }

    #[test]
    fn reads_and_filters_audit_logs() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Audit").unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(crate::session::Session {
            user_id: "admin".into(),
            login: "admin".into(),
            display_name: "A".into(),
            role_id: "admin".into(),
            avatar_color: "#000".into(),
            must_change_password: false,
            login_at: "2026-10-01T00:00:00Z".into(),
            expires_at: None,
            role_missing_reported: false,
        });

        seed(dir.path());

        let page = audit_get_logs_impl(&state, 100, 0, None, None, None).unwrap();
        assert_eq!(page.total, 3);
        // All three seeded actions are present (ordering among same-ms rows is
        // insertion order, so only membership is asserted here).
        let actions: std::collections::HashSet<&str> =
            page.items.iter().map(|e| e.action.as_str()).collect();
        assert!(actions.contains("workspace.create"));
        assert!(actions.contains("auth.login"));
        assert!(actions.contains("task.create"));

        let by_action = audit_get_logs_impl(&state, 100, 0, None, Some("task.create".into()), None).unwrap();
        assert_eq!(by_action.total, 1);
        assert_eq!(by_action.items[0].entity_id, "T-1");

        let by_user = audit_get_logs_impl(&state, 100, 0, Some("alice".into()), None, None).unwrap();
        assert_eq!(by_user.total, 2);

        let paged = audit_get_logs_impl(&state, 2, 1, None, None, None).unwrap();
        assert_eq!(paged.items.len(), 2);
        assert_eq!(paged.total, 3);
    }

    #[test]
    fn requires_audit_view_permission() {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Audit2").unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(crate::session::Session {
            user_id: "admin".into(),
            login: "admin".into(),
            display_name: "A".into(),
            role_id: "observer".into(),
            avatar_color: "#000".into(),
            must_change_password: false,
            login_at: "2026-10-01T00:00:00Z".into(),
            expires_at: None,
            role_missing_reported: false,
        });
        let err = audit_get_logs_impl(&state, 10, 0, None, None, None).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }
}
