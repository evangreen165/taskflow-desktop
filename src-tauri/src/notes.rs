use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::audit::now_rfc3339;
use crate::error::AppError;
use crate::fsops;

/// On-disk layout per note:
/// `notes/{id}/meta.json`, `notes/{id}/note.md`,
/// `notes/{id}/history/{timestamp}-{uuid}.json` (snapshots).
const MAX_HISTORY: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Alternative names usable in `[[…]]` links.
    #[serde(default)]
    pub aliases: Vec<String>,
    pub author_id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub published_at: Option<String>,
    pub status: NoteStatus,
    pub version: u64,
    #[serde(default)]
    pub linked_task_ids: Vec<String>,
    /// Spaces this note is shared with (read-only access).
    #[serde(default)]
    pub shared_with_spaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub meta: NoteMeta,
    pub content: String,
    pub history_versions: Vec<u64>,
    /// True when the note is being read through a space it was shared with.
    #[serde(default)]
    pub shared: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NoteStatus {
    #[default]
    Draft,
    Published,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteSnapshot {
    meta: NoteMeta,
    content: String,
}

fn validate_title(title: &str) -> Result<String, AppError> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 300 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "note title must be between 1 and 300 characters",
        ));
    }
    Ok(title.to_string())
}

/// Whitespace-collapsed snippet of the first ~500 chars (grid card preview).
pub fn preview_of(content: &str) -> String {
    const MAX: usize = 500;
    let collapsed = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars: Vec<char> = collapsed.chars().collect();
    let mut preview: String = chars.iter().take(MAX).collect();
    if chars.len() > MAX {
        preview.push('…');
    }
    preview
}

fn note_dir(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(AppError::new("INVALID_INPUT", "invalid note id"));
    }
    crate::path::resolve_rel(root, &format!("notes/{id}"))
}

fn meta_path(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    Ok(note_dir(root, id)?.join("meta.json"))
}

fn content_path(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    Ok(note_dir(root, id)?.join("note.md"))
}

fn history_dir(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    Ok(note_dir(root, id)?.join("history"))
}

fn version_conflict(meta: &NoteMeta) -> AppError {
    match serde_json::to_string(meta) {
        Ok(details) => AppError::with_details(
            "VERSION_CONFLICT",
            "note was modified by another user",
            details,
        ),
        Err(_) => AppError::new("VERSION_CONFLICT", "note was modified by another user"),
    }
}

fn write_snapshot(root: &Path, id: &str, meta: &NoteMeta, content: &str) -> Result<(), AppError> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%6fZ").to_string();
    let rel = format!("notes/{id}/history/{stamp}-{}.json", uuid::Uuid::new_v4());
    let path = crate::path::resolve_rel(root, &rel)?;
    let snapshot = NoteSnapshot {
        meta: meta.clone(),
        content: content.to_string(),
    };
    fsops::write_json_atomic(&path, &snapshot)
}

/// Keeps the newest `MAX_HISTORY` snapshots (ordered by filename, which is
/// timestamp-sortable).
fn prune_history(dir: &Path) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Ok(());
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| AppError::io("list history", e))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    if files.len() <= MAX_HISTORY {
        return Ok(());
    }
    files.sort();
    let excess = files.len() - MAX_HISTORY;
    for path in files.into_iter().take(excess) {
        let _ = std::fs::remove_file(&path);
    }
    Ok(())
}

fn read_snapshots(root: &Path, id: &str) -> Result<Vec<NoteSnapshot>, AppError> {
    let dir = history_dir(root, id)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut snapshots = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list history", e))? {
        let entry = entry.map_err(|e| AppError::io("read history dir", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        snapshots.push(fsops::read_json::<NoteSnapshot>(&path)?);
    }
    Ok(snapshots)
}

pub fn list_meta(root: &Path) -> Result<Vec<NoteMeta>, AppError> {
    let notes_dir = root.join("notes");
    if !notes_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut metas = Vec::new();
    for entry in std::fs::read_dir(&notes_dir).map_err(|e| AppError::io("list notes", e))? {
        let entry = entry.map_err(|e| AppError::io("read notes dir", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let meta_file = path.join("meta.json");
        if !meta_file.is_file() {
            continue;
        }
        metas.push(fsops::read_json::<NoteMeta>(&meta_file)?);
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id)));
    Ok(metas)
}

pub fn get_meta(root: &Path, id: &str) -> Result<NoteMeta, AppError> {
    let path = meta_path(root, id)?;
    if !path.is_file() {
        return Err(AppError::new("NOT_FOUND", format!("note '{id}' does not exist")));
    }
    fsops::read_json(&path)
}

pub fn read_content(root: &Path, id: &str) -> Result<String, AppError> {
    fsops::read_text(&content_path(root, id)?)
}

fn categories_path(root: &Path) -> PathBuf {
    root.join("categories.json")
}

/// Explicit KB category list (stored at `{space}/categories.json`).
pub fn list_categories(root: &Path) -> Result<Vec<String>, AppError> {
    let path = categories_path(root);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    fsops::read_json::<Vec<String>>(&path)
}

fn write_categories(root: &Path, categories: &[String]) -> Result<(), AppError> {
    fsops::write_json_atomic(&categories_path(root), &categories)
}

/// Adds a category (idempotent) and returns the updated list.
pub fn create_category(root: &Path, name: &str) -> Result<Vec<String>, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "category name must be between 1 and 80 characters",
        ));
    }
    let mut categories = list_categories(root)?;
    if !categories.iter().any(|c| c == name) {
        categories.push(name.to_string());
        categories.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        write_categories(root, &categories)?;
    }
    Ok(categories)
}

/// Removes a category (idempotent) and returns the updated list.
pub fn delete_category(root: &Path, name: &str) -> Result<Vec<String>, AppError> {
    let mut categories = list_categories(root)?;
    let before = categories.len();
    categories.retain(|c| c != name);
    if categories.len() != before {
        write_categories(root, &categories)?;
    }
    Ok(categories)
}

/// Version numbers that have a history snapshot, newest first.
pub fn history_versions(root: &Path, id: &str) -> Result<Vec<u64>, AppError> {
    let mut snapshots = read_snapshots(root, id)?;
    snapshots.sort_by(|a, b| b.meta.version.cmp(&a.meta.version));
    Ok(snapshots.into_iter().map(|s| s.meta.version).collect())
}

/// Snapshot metas (newest first) for the version history UI.
pub fn get_history(root: &Path, id: &str) -> Result<Vec<NoteMeta>, AppError> {
    let _ = get_meta(root, id)?;
    let mut snapshots = read_snapshots(root, id)?;
    snapshots.sort_by(|a, b| b.meta.version.cmp(&a.meta.version));
    Ok(snapshots.into_iter().map(|s| s.meta).collect())
}

pub fn get(root: &Path, id: &str) -> Result<Note, AppError> {
    let meta = get_meta(root, id)?;
    let content = read_content(root, id)?;
    let versions = history_versions(root, id)?;
    Ok(Note {
        meta,
        content,
        history_versions: versions,
        shared: false,
    })
}

pub fn create(
    root: &Path,
    author_id: &str,
    title: &str,
    category: &str,
    content: &str,
) -> Result<Note, AppError> {
    let title = validate_title(title)?;
    let now = now_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let meta = NoteMeta {
        id: id.clone(),
        title,
        category: category.trim().to_string(),
        tags: Vec::new(),
        aliases: Vec::new(),
        author_id: author_id.to_string(),
        created_at: now.clone(),
        updated_at: now,
        published_at: None,
        status: NoteStatus::Draft,
        version: 1,
        linked_task_ids: Vec::new(),
        shared_with_spaces: Vec::new(),
    };
    fsops::write_json_atomic(&meta_path(root, &id)?, &meta)?;
    fsops::write_text_atomic(&content_path(root, &id)?, content)?;
    Ok(Note {
        meta,
        content: content.to_string(),
        history_versions: Vec::new(),
        shared: false,
    })
}

pub fn update(
    root: &Path,
    id: &str,
    title: &str,
    category: &str,
    tags: &[String],
    aliases: &[String],
    content: &str,
    expected_version: u64,
) -> Result<Note, AppError> {
    let mut meta = get_meta(root, id)?;
    if meta.version != expected_version {
        return Err(version_conflict(&meta));
    }
    let current_content = read_content(root, id)?;
    if current_content != content {
        write_snapshot(root, id, &meta, &current_content)?;
    }
    meta.title = validate_title(title)?;
    meta.category = category.trim().to_string();
    meta.tags = tags.to_vec();
    meta.aliases = normalize_aliases(aliases);
    meta.version += 1;
    meta.updated_at = now_rfc3339();
    fsops::write_json_atomic(&meta_path(root, id)?, &meta)?;
    fsops::write_text_atomic(&content_path(root, id)?, content)?;
    prune_history(&history_dir(root, id)?)?;
    get(root, id)
}

/// Trims aliases, drops empties and de-duplicates (case-insensitive).
fn normalize_aliases(aliases: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for raw in aliases {
        let alias = raw.trim();
        if alias.is_empty() {
            continue;
        }
        if seen.insert(alias.to_lowercase()) {
            out.push(alias.to_string());
        }
    }
    out
}

pub fn publish(root: &Path, id: &str, expected_version: u64) -> Result<Note, AppError> {
    let mut meta = get_meta(root, id)?;
    if meta.version != expected_version {
        return Err(version_conflict(&meta));
    }
    meta.status = NoteStatus::Published;
    if meta.published_at.is_none() {
        meta.published_at = Some(now_rfc3339());
    }
    meta.version += 1;
    meta.updated_at = now_rfc3339();
    fsops::write_json_atomic(&meta_path(root, id)?, &meta)?;
    get(root, id)
}

/// Replaces the note's sharing list (deduplicated) and persists the meta.
pub fn set_shared_with_spaces(
    root: &Path,
    id: &str,
    targets: Vec<String>,
) -> Result<NoteMeta, AppError> {
    let mut meta = get_meta(root, id)?;
    let mut targets: Vec<String> = targets
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    targets.sort();
    targets.dedup();
    meta.shared_with_spaces = targets;
    fsops::write_json_atomic(&meta_path(root, id)?, &meta)?;
    Ok(meta)
}

pub fn delete(root: &Path, id: &str) -> Result<(), AppError> {
    let dir = note_dir(root, id)?;
    if !dir.is_dir() {
        return Err(AppError::new("NOT_FOUND", format!("note '{id}' does not exist")));
    }
    std::fs::remove_dir_all(&dir).map_err(|e| AppError::io("remove note", e))
}

fn find_snapshot(root: &Path, id: &str, version: u64) -> Result<NoteSnapshot, AppError> {
    for snapshot in read_snapshots(root, id)? {
        if snapshot.meta.version == version {
            return Ok(snapshot);
        }
    }
    Err(AppError::new(
        "NOT_FOUND",
        format!("version {version} not found in note history"),
    ))
}

/// Restores an old version as a NEW version on top of the current history:
/// title/category/tags/content come from the snapshot, current status and
/// publish date are kept, and the version increments.
pub fn restore_version(root: &Path, id: &str, version: u64) -> Result<Note, AppError> {
    let current_meta = get_meta(root, id)?;
    let current_content = read_content(root, id)?;
    let snapshot = find_snapshot(root, id, version)?;

    write_snapshot(root, id, &current_meta, &current_content)?;

    let mut meta = current_meta;
    meta.title = snapshot.meta.title;
    meta.category = snapshot.meta.category;
    meta.tags = snapshot.meta.tags;
    meta.linked_task_ids = snapshot.meta.linked_task_ids;
    meta.version += 1;
    meta.updated_at = now_rfc3339();
    fsops::write_json_atomic(&meta_path(root, id)?, &meta)?;
    fsops::write_text_atomic(&content_path(root, id)?, &snapshot.content)?;
    prune_history(&history_dir(root, id)?)?;
    get(root, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn serializes_camel_case_and_status_values() {
        let dir = tempdir().unwrap();
        let note = create(
            dir.path(),
            "u1",
            "Онбординг",
            "Процессы",
            "# Заголовок\n\nТекст.",
        )
        .unwrap();
        let value = serde_json::to_value(&note).unwrap();
        for key in [
            "id",
            "title",
            "category",
            "tags",
            "aliases",
            "authorId",
            "createdAt",
            "updatedAt",
            "publishedAt",
            "status",
            "version",
            "linkedTaskIds",
        ] {
            assert!(value.get("meta").unwrap().get(key).is_some(), "missing key {key}");
        }
        assert_eq!(value["meta"]["status"], "draft");
        assert_eq!(value["meta"]["version"], 1);
        assert_eq!(value["content"], "# Заголовок\n\nТекст.");
        assert_eq!(value["historyVersions"], json!([]));
        assert!(dir.path().join("notes").join(&note.meta.id).join("note.md").is_file());
    }

    #[test]
    fn rejects_blank_title_and_invalid_id() {
        let dir = tempdir().unwrap();
        assert_eq!(
            create(dir.path(), "u1", "  ", "C", "x").unwrap_err().code,
            "INVALID_INPUT"
        );
        assert_eq!(get_meta(dir.path(), "not-a-uuid").unwrap_err().code, "INVALID_INPUT");
    }
}
