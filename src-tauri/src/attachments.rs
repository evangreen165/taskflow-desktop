use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use crate::error::AppError;
use crate::fsops;

const MAX_ATTACHMENT_SIZE: u64 = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS: &[&str] = &[
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "pdf",
    "txt",
    "md",
    "csv",
    "json",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "zip",
    "rar",
    "7z",
    "mp3",
    "mp4",
    "wav",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    pub sha256: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
    pub ext: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentResult {
    pub info: AttachmentInfo,
    /// False when the file was already present (content-addressed dedup).
    pub created: bool,
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "zip" => "application/zip",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}

fn ext_of(name: &str) -> Option<&str> {
    let dot = name.rfind('.')?;
    let ext = &name[dot + 1..];
    if ext.is_empty() {
        return None;
    }
    Some(ext)
}

fn attachment_path(root: &Path, sha256: &str, ext: &str) -> Result<PathBuf, AppError> {
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::new("INVALID_INPUT", "invalid sha256"));
    }
    if !ALLOWED_EXTENSIONS.contains(&ext) {
        return Err(AppError::new(
            "INVALID_INPUT",
            format!("extension '.{ext}' is not allowed"),
        ));
    }
    Ok(root.join("attachments").join(format!("{sha256}.{ext}")))
}

/// Locates `attachments/{sha256}.*` without knowing the extension.
pub fn resolve(root: &Path, sha256: &str) -> Result<PathBuf, AppError> {
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::new("INVALID_INPUT", "invalid sha256"));
    }
    let dir = root.join("attachments");
    if !dir.is_dir() {
        return Err(AppError::new("NOT_FOUND", "attachment not found"));
    }
    let prefix = format!("{sha256}.");
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("list attachments", e))? {
        let entry = entry.map_err(|e| AppError::io("read attachments dir", e))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(&prefix) {
            return Ok(entry.path());
        }
    }
    Err(AppError::new("NOT_FOUND", "attachment not found"))
}

/// Copies `source_path` into `attachments/{sha256}.{ext}`, deduplicating by
/// content hash. The source is the only place an absolute path is accepted.
pub fn add(root: &Path, source_path: &str, name: &str) -> Result<(AttachmentInfo, bool), AppError> {
    let base_name = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| name.to_string());
    let raw_ext = ext_of(&base_name)
        .ok_or_else(|| AppError::new("INVALID_INPUT", "file must have an extension"))?;
    let ext = raw_ext.to_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::new(
            "INVALID_INPUT",
            format!("extension '.{ext}' is not allowed"),
        ));
    }

    let source = Path::new(source_path);
    let meta = std::fs::metadata(source).map_err(|e| AppError::io("attachment source", e))?;
    if meta.len() > MAX_ATTACHMENT_SIZE {
        return Err(AppError::new(
            "INVALID_INPUT",
            "file exceeds the 50 MB attachment limit",
        ));
    }

    let hash = fsops::hash_file(source)?;
    let target = attachment_path(root, &hash.sha256, &ext)?;
    let created = if target.is_file() {
        false
    } else {
        std::fs::copy(source, &target).map_err(|e| AppError::io("copy attachment", e))?;
        true
    };

    let info = AttachmentInfo {
        sha256: hash.sha256,
        name: base_name,
        mime: mime_for(&ext).to_string(),
        size: hash.size,
        ext,
    };
    Ok((info, created))
}

/// Reads the attachment and returns it as a `data:<mime>;base64,…` URL.
pub fn get_base64(root: &Path, sha256: &str) -> Result<String, AppError> {
    let path = resolve(root, sha256)?;
    let bytes = std::fs::read(&path).map_err(|e| AppError::io("read attachment", e))?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let mime = mime_for(&ext);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// True when any article references `attachment://{sha256}`.
fn is_referenced(root: &Path, sha256: &str) -> Result<bool, AppError> {
    let needle = format!("attachment://{sha256}");
    let notes_dir = root.join("notes");
    if !notes_dir.is_dir() {
        return Ok(false);
    }
    for entry in std::fs::read_dir(&notes_dir).map_err(|e| AppError::io("list notes", e))? {
        let entry = entry.map_err(|e| AppError::io("read notes dir", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let content_file = path.join("note.md");
        if content_file.is_file() {
            if let Ok(text) = fsops::read_text(&content_file) {
                if text.contains(&needle) {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

/// Deletes the attachment unless an article still references it.
pub fn remove(root: &Path, sha256: &str) -> Result<(), AppError> {
    if is_referenced(root, sha256)? {
        return Ok(());
    }
    let path = resolve(root, sha256)?;
    std::fs::remove_file(&path).map_err(|e| AppError::io("remove attachment", e))
}
