use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::{fsops, path};

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn is_valid_entity(entity: &str) -> bool {
    let mut chars = entity.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    !entity.is_empty()
        && entity.len() <= 32
        && entity
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id != "."
        && id != ".."
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// A lock key is `{entity}-{id}`, e.g. `task-T-42` or `note-n_01`.
/// The entity never contains `-`, so the first `-` is the separator.
pub fn is_valid_key(key: &str) -> bool {
    if key.len() > 160 {
        return false;
    }
    match key.split_once('-') {
        Some((entity, id)) => is_valid_entity(entity) && is_valid_id(id),
        None => false,
    }
}

fn lock_file_path(root: &Path, key: &str) -> Result<PathBuf, AppError> {
    if !is_valid_key(key) {
        return Err(AppError::new(
            "INVALID_INPUT",
            "lock key must be '{entity}-{id}' with entity ^[a-z][a-z0-9_]{0,31}$ and id [A-Za-z0-9._-]{1,128}",
        ));
    }
    path::join_depth_limited(root, &["locks", &format!("{key}.lock")])
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockFile {
    pub key: String,
    pub owner: String,
    pub token: String,
    pub acquired_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    /// True when this call obtained the lock.
    pub acquired: bool,
    /// True while a valid (non-expired) lock exists.
    pub is_locked: bool,
    pub key: String,
    pub expires_at: Option<String>,
    pub owner: Option<String>,
    /// Present only when this call acquired the lock (needed to release it).
    pub token: Option<String>,
}

fn is_expired(expires_at: &str) -> bool {
    DateTime::parse_from_rfc3339(expires_at)
        .map(|t| t.with_timezone(&Utc) <= Utc::now())
        .unwrap_or(true)
}

fn held_status(lock: &LockFile) -> LockStatus {
    LockStatus {
        acquired: false,
        is_locked: true,
        key: lock.key.clone(),
        expires_at: Some(lock.expires_at.clone()),
        owner: Some(lock.owner.clone()),
        token: None,
    }
}

fn free_status(key: &str) -> LockStatus {
    LockStatus {
        acquired: false,
        is_locked: false,
        key: key.to_string(),
        expires_at: None,
        owner: None,
        token: None,
    }
}

/// Acquires a TTL lock for `key`. Stale (expired) locks are reclaimed once.
pub fn acquire(root: &Path, key: &str, ttl_sec: u64, owner: &str) -> Result<LockStatus, AppError> {
    if ttl_sec == 0 {
        return Err(AppError::new("INVALID_INPUT", "ttlSec must be greater than zero"));
    }
    let file = lock_file_path(root, key)?;
    let now = Utc::now();
    let token = uuid::Uuid::new_v4().to_string();
    let lock = LockFile {
        key: key.to_string(),
        owner: owner.to_string(),
        token: token.clone(),
        acquired_at: now.to_rfc3339_opts(SecondsFormat::Millis, true),
        expires_at: (now + Duration::seconds(ttl_sec as i64))
            .to_rfc3339_opts(SecondsFormat::Millis, true),
    };
    let bytes = serde_json::to_vec_pretty(&lock)?;

    for attempt in 0..2 {
        match fsops::create_exclusive(&file, &bytes) {
            Ok(()) => {
                return Ok(LockStatus {
                    acquired: true,
                    is_locked: true,
                    key: key.to_string(),
                    expires_at: Some(lock.expires_at.clone()),
                    owner: Some(owner.to_string()),
                    token: Some(token),
                });
            }
            Err(e) if e.code == "ALREADY_EXISTS" => match fsops::read_json::<LockFile>(&file) {
                Ok(existing) if is_expired(&existing.expires_at) && attempt == 0 => {
                    // Reclaim a stale lock once, then retry.
                    let _ = std::fs::remove_file(&file);
                    continue;
                }
                Ok(existing) => return Ok(held_status(&existing)),
                Err(_) if attempt == 0 => {
                    // Unreadable/corrupt lock: reclaim once.
                    let _ = std::fs::remove_file(&file);
                    continue;
                }
                Err(e) => return Err(e),
            },
            Err(e) => return Err(e),
        }
    }
    Err(AppError::new("LOCKED", format!("'{key}' is locked")))
}

/// Releases a lock owned by `token`. Idempotent when the lock is already gone.
pub fn release(root: &Path, key: &str, token: &str) -> Result<(), AppError> {
    let file = lock_file_path(root, key)?;
    match fsops::read_json::<LockFile>(&file) {
        Ok(existing) => {
            if existing.token != token {
                return Err(AppError::new(
                    "LOCKED",
                    "lock is owned by another session and cannot be released",
                ));
            }
            fsops::remove_path(&file)
        }
        Err(e) if e.code == "NOT_FOUND" => Ok(()),
        Err(e) => Err(e),
    }
}

pub fn is_locked(root: &Path, key: &str) -> Result<LockStatus, AppError> {
    let file = lock_file_path(root, key)?;
    if !file.exists() {
        return Ok(free_status(key));
    }
    match fsops::read_json::<LockFile>(&file) {
        Ok(existing) => {
            if is_expired(&existing.expires_at) {
                Ok(free_status(key))
            } else {
                Ok(held_status(&existing))
            }
        }
        Err(_) => Ok(free_status(key)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn acquire_hold_release_cycle() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let status = acquire(root, "task-T-1", 60, "m1").unwrap();
        assert!(status.acquired && status.is_locked);
        let token = status.token.clone().unwrap();

        let second = acquire(root, "task-T-1", 60, "m2").unwrap();
        assert!(!second.acquired && second.is_locked);

        assert!(is_locked(root, "task-T-1").unwrap().is_locked);
        release(root, "task-T-1", &token).unwrap();
        assert!(!is_locked(root, "task-T-1").unwrap().is_locked);
    }

    #[test]
    fn release_requires_matching_token() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        acquire(root, "task-T-2", 60, "m1").unwrap();
        let err = release(root, "task-T-2", "wrong").unwrap_err();
        assert_eq!(err.code, "LOCKED");
        assert!(is_locked(root, "task-T-2").unwrap().is_locked);
    }

    #[test]
    fn expired_lock_is_reclaimed() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = lock_file_path(root, "task-T-3").unwrap();
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let stale = LockFile {
            key: "task-T-3".into(),
            owner: "dead".into(),
            token: "old".into(),
            acquired_at: "2000-01-01T00:00:00.000Z".into(),
            expires_at: "2000-01-01T00:00:01.000Z".into(),
        };
        fsops::write_json_atomic(&file, &stale).unwrap();
        assert!(!is_locked(root, "task-T-3").unwrap().is_locked);
        let status = acquire(root, "task-T-3", 60, "m1").unwrap();
        assert!(status.acquired);
    }

    #[test]
    fn release_is_idempotent_when_missing() {
        let dir = tempdir().unwrap();
        release(dir.path(), "task-T-9", "any").unwrap();
    }

    #[test]
    fn validates_keys() {
        assert!(is_valid_key("task-T-1"));
        assert!(is_valid_key("note-n_01.2"));
        assert!(!is_valid_key("Task-T-1"));
        assert!(!is_valid_key("task"));
        assert!(!is_valid_key("task-a/b"));
        assert!(!is_valid_key("task-.."));
        let dir = tempdir().unwrap();
        assert!(acquire(dir.path(), "Task-T-1", 60, "m").is_err());
        assert!(acquire(dir.path(), "task-T-1", 0, "m").is_err());
    }
}