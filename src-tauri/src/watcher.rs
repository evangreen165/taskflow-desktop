use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::audit::now_rfc3339;
use crate::error::AppError;

/// Frontend event name for filesystem changes in the workspace.
pub const FS_EVENT: &str = "workspace://fs-event";

/// SMB saves can emit dozens of events per second; batch them for a while
/// before notifying the frontend so it does not refetch in a tight loop.
const DEBOUNCE: Duration = Duration::from_millis(700);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEvent {
    pub kind: String,
    pub path: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsBatchEvent {
    pub events: Vec<FsEvent>,
}

fn classify(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("created"),
        EventKind::Modify(_) => Some("modified"),
        EventKind::Remove(_) => Some("removed"),
        EventKind::Any | EventKind::Other => Some("changed"),
        EventKind::Access(_) => None,
    }
}

/// Our own atomic-write temp files and lock churn must not surface as changes.
fn is_noise(rel: &str) -> bool {
    rel.starts_with("locks/")
        || rel.contains("/locks/")
        || rel.contains(".taskflow-")
        || rel.ends_with(".tmp")
}

/// Keeps the underlying watcher alive for as long as it is held.
pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
}

/// Starts a recursive, debounced watcher on the workspace root. Change batches
/// are emitted to the frontend as `workspace://fs-event`.
pub fn start(root: &Path, app: AppHandle) -> Result<WorkspaceWatcher, AppError> {
    let root_buf: PathBuf = root.to_path_buf();
    let (tx, rx) = mpsc::channel::<FsEvent>();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else { return };
            let Some(kind) = classify(&event.kind) else {
                return;
            };
            for changed in event.paths {
                if let Some(rel) = crate::path::rel_path_between(&root_buf, &changed) {
                    if is_noise(&rel) {
                        continue;
                    }
                    let _ = tx.send(FsEvent {
                        kind: kind.to_string(),
                        path: rel,
                        timestamp: now_rfc3339(),
                    });
                }
            }
        },
        Config::default(),
    )?;
    watcher.watch(root, RecursiveMode::Recursive)?;

    thread::spawn(move || {
        let mut batch: Vec<FsEvent> = Vec::new();
        let mut deadline: Option<Instant> = None;
        loop {
            let timeout = deadline
                .map(|d| d.saturating_duration_since(Instant::now()))
                .unwrap_or(Duration::from_secs(60));
            match rx.recv_timeout(timeout) {
                Ok(event) => {
                    batch.push(event);
                    if deadline.is_none() {
                        deadline = Some(Instant::now() + DEBOUNCE);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if !batch.is_empty() {
                        let events = std::mem::take(&mut batch);
                        let _ = app.emit(FS_EVENT, FsBatchEvent { events });
                        deadline = None;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(WorkspaceWatcher { _watcher: watcher })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noise_filter_ignores_temp_and_locks() {
        assert!(is_noise("locks/task-T-1.lock"));
        assert!(is_noise("tasks/.taskflow-x.json.abcd.tmp"));
        assert!(is_noise("notes/n1/note.md.tmp"));
        assert!(!is_noise("tasks/T-1.json"));
        assert!(!is_noise("notes/n1/note.md"));
    }

    #[test]
    fn classifies_event_kinds() {
        assert_eq!(classify(&EventKind::Create(notify::event::CreateKind::File)), Some("created"));
        assert_eq!(classify(&EventKind::Remove(notify::event::RemoveKind::File)), Some("removed"));
        assert_eq!(classify(&EventKind::Access(notify::event::AccessKind::Read)), None);
    }
}