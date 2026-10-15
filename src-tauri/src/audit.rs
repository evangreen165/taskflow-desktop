use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::RwLock;
use serde::Serialize;
use serde_json::Value;
use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::{Context, Layer};

use crate::error::AppError;
use crate::fsops;

pub use crate::locking::now_rfc3339;

/// Tracing target used for user-action audit events. `AuditLayer` forwards
/// every event with this target into `<workspace>/audit/{yyyy-mm}.log`.
pub const AUDIT_TARGET: &str = "taskflow_audit";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalEvent<'a> {
    id: String,
    ts: String,
    actor: &'a str,
    kind: &'a str,
    entity: &'a str,
    entity_id: &'a str,
    data: &'a Value,
}

/// Append-only change journal: one immutable file per event.
pub fn write_event(
    root: &Path,
    actor: &str,
    kind: &str,
    entity: &str,
    entity_id: &str,
    data: Value,
) -> Result<(), AppError> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ").to_string();
    let rel = format!("events/{stamp}-{}.json", uuid::Uuid::new_v4());
    let path = crate::path::resolve_rel(root, &rel)?;
    let event = JournalEvent {
        id: uuid::Uuid::new_v4().to_string(),
        ts: now_rfc3339(),
        actor,
        kind,
        entity,
        entity_id,
        data: &data,
    };
    fsops::write_json_atomic(&path, &event)
}

/// Appends one JSON line to the monthly user-action audit log.
pub fn append_audit(
    root: &Path,
    actor: &str,
    action: &str,
    entity: &str,
    entity_id: &str,
    detail: Value,
) -> Result<(), AppError> {
    let month = chrono::Utc::now().format("%Y-%m").to_string();
    let path = crate::path::resolve_rel(root, &format!("audit/{month}.log"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::io("create audit dir", e))?;
    }
    let line = serde_json::json!({
        "ts": now_rfc3339(),
        "actor": actor,
        "action": action,
        "entity": entity,
        "entityId": entity_id,
        "detail": detail,
    });
    let mut text = serde_json::to_string(&line)?;
    text.push('\n');
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| AppError::io("open audit log", e))?;
    file.write_all(text.as_bytes())
        .map_err(|e| AppError::io("append audit log", e))?;
    Ok(())
}

/// Emits a user-action audit event through `tracing`. The `AuditLayer`
/// installed by the app writes it to the workspace `audit/` log.
pub fn emit(actor: &str, action: &str, entity: &str, entity_id: &str, detail: Value) {
    let detail = detail.to_string();
    tracing::info!(
        target: AUDIT_TARGET,
        actor = actor,
        action = action,
        entity = entity,
        entity_id = entity_id,
        detail = detail.as_str()
    );
}

#[derive(Default)]
struct AuditFields {
    actor: Option<String>,
    action: Option<String>,
    entity: Option<String>,
    entity_id: Option<String>,
    detail: Option<String>,
}

impl AuditFields {
    fn set(&mut self, name: &str, value: String) {
        match name {
            "actor" => self.actor = Some(value),
            "action" => self.action = Some(value),
            "entity" => self.entity = Some(value),
            "entity_id" => self.entity_id = Some(value),
            "detail" => self.detail = Some(value),
            _ => {}
        }
    }
}

impl Visit for AuditFields {
    fn record_str(&mut self, field: &Field, value: &str) {
        self.set(field.name(), value.to_string());
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.set(field.name(), format!("{value:?}"));
    }
}

/// Tracing layer that redirects `taskflow_audit` events into the active
/// workspace's monthly audit log. No-op while no workspace is active.
#[derive(Clone)]
pub struct AuditLayer {
    root: Arc<RwLock<Option<PathBuf>>>,
}

impl AuditLayer {
    pub fn new(root: Arc<RwLock<Option<PathBuf>>>) -> Self {
        Self { root }
    }
}

impl<S: Subscriber> Layer<S> for AuditLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if event.metadata().target() != AUDIT_TARGET {
            return;
        }
        let mut fields = AuditFields::default();
        event.record(&mut fields);

        let root = match self.root.read().clone() {
            Some(root) => root,
            None => return,
        };
        let detail: Value = fields
            .detail
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok())
            .unwrap_or(Value::Null);
        let _ = append_audit(
            &root,
            fields.actor.as_deref().unwrap_or("system"),
            fields.action.as_deref().unwrap_or("event"),
            fields.entity.as_deref().unwrap_or(""),
            fields.entity_id.as_deref().unwrap_or(""),
            detail,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn write_event_creates_unique_files() {
        let dir = tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("events")).unwrap();
        write_event(dir.path(), "alice", "task.created", "task", "T-1", serde_json::json!({ "x": 1 }))
            .unwrap();
        write_event(dir.path(), "alice", "task.created", "task", "T-2", serde_json::json!({}))
            .unwrap();
        let files: Vec<_> = std::fs::read_dir(dir.path().join("events")).unwrap().collect();
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn append_audit_writes_jsonl() {
        let dir = tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("audit")).unwrap();
        append_audit(dir.path(), "alice", "task.create", "task", "T-1", serde_json::json!({})).unwrap();
        append_audit(dir.path(), "bob", "task.edit", "task", "T-1", serde_json::json!({})).unwrap();
        let month = chrono::Utc::now().format("%Y-%m").to_string();
        let content =
            std::fs::read_to_string(dir.path().join("audit").join(format!("{month}.log"))).unwrap();
        let lines: Vec<_> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        let first: Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["actor"], "alice");
        assert_eq!(first["action"], "task.create");
        assert_eq!(first["entityId"], "T-1");
    }
}