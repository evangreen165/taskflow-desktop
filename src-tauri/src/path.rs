use std::path::{Component, Path, PathBuf};

use crate::error::AppError;

/// Normalizes a user-supplied path to a canonical relative path.
///
/// Data never stores absolute paths: every path that flows through the
/// storage API is relative to the workspace root and every absolute path,
/// parent traversal (`..`) or drive/UNC form is rejected here.
pub fn normalize_rel_path(rel: &str) -> Result<String, AppError> {
    if rel.is_empty() {
        return Err(AppError::new("INVALID_PATH", "path must not be empty"));
    }
    if rel.len() > 1024 {
        return Err(AppError::new("INVALID_PATH", "path is too long"));
    }
    let bytes = rel.as_bytes();
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err(AppError::new("INVALID_PATH", "absolute paths are not allowed"));
    }
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err(AppError::new("INVALID_PATH", "drive paths are not allowed"));
    }

    let mut parts: Vec<&str> = Vec::new();
    for comp in rel.split(['/', '\\']) {
        match comp {
            "" | "." => continue,
            ".." => {
                return Err(AppError::new(
                    "INVALID_PATH",
                    "parent traversal ('..') is not allowed",
                ))
            }
            c => {
                if c.contains(':') {
                    return Err(AppError::new(
                        "INVALID_PATH",
                        "':' is not allowed in path components",
                    ));
                }
                parts.push(c);
            }
        }
    }
    let normalized = parts.join("/");
    if normalized.is_empty() {
        return Err(AppError::new("INVALID_PATH", "path is empty after normalization"));
    }
    Ok(normalized)
}

/// Resolves a relative path against a workspace root with traversal safety.
pub fn resolve_rel(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let normalized = normalize_rel_path(rel)?;
    let mut joined = root.to_path_buf();
    for part in normalized.split('/') {
        joined.push(part);
    }
    // Defense in depth: the join must stay under the root. Component-level
    // inspection guarantees `..` never survived normalization.
    let under_root = joined
        .components()
        .all(|c| !matches!(c, Component::ParentDir));
    if !under_root {
        return Err(AppError::new("INVALID_PATH", "path escapes the workspace root"));
    }
    Ok(joined)
}

/// Builds a stable relative path for a lock or entity file.
pub fn join_depth_limited(root: &Path, parts: &[&str]) -> Result<PathBuf, AppError> {
    if parts.is_empty() || parts.len() > 6 {
        return Err(AppError::new("INVALID_PATH", "path depth out of range"));
    }
    let mut joined = root.to_path_buf();
    for part in parts {
        if part.is_empty()
            || part.contains('/')
            || part.contains('\\')
            || part.contains(':')
            || part.contains("..")
            || !part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            return Err(AppError::new("INVALID_PATH", "invalid path component"));
        }
        joined.push(part);
    }
    Ok(joined)
}

pub fn rel_path_between(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut out: Vec<&str> = Vec::new();
    for c in rel.components() {
        match c {
            Component::Normal(os) => out.push(os.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset_workspace() -> PathBuf {
        std::env::temp_dir().join("taskflow-path-tests")
    }

    #[test]
    fn rejects_absolute() {
        assert!(normalize_rel_path("/etc/passwd").is_err());
        assert!(normalize_rel_path("\\server\\share\\x").is_err());
        assert!(normalize_rel_path("C:\\x").is_err());
        assert!(normalize_rel_path("c:/x").is_err());
    }

    #[test]
    fn rejects_traversal() {
        assert!(normalize_rel_path("../secret").is_err());
        assert!(normalize_rel_path("a/../../b").is_err());
        assert!(normalize_rel_path("..").is_err());
    }

    #[test]
    fn rejects_colon_components() {
        assert!(normalize_rel_path("a:b.json").is_err());
    }

    #[test]
    fn normalizes_separators() {
        assert_eq!(normalize_rel_path("a\\b\\c.json").unwrap(), "a/b/c.json");
        assert_eq!(normalize_rel_path("a//b/./c").unwrap(), "a/b/c");
        assert_eq!(normalize_rel_path("tasks").unwrap(), "tasks");
    }

    #[test]
    fn rejects_empty() {
        assert!(normalize_rel_path("").is_err());
        assert!(normalize_rel_path("///").is_err());
    }

    #[test]
    fn resolve_stays_under_root() {
        let root = reset_workspace();
        let p = resolve_rel(&root, "tasks/abc.json").unwrap();
        assert_eq!(p, root.join("tasks").join("abc.json"));
        assert!(resolve_rel(&root, "../evil").is_err());
    }

    #[test]
    fn join_rejects_bad_components() {
        let root = reset_workspace();
        assert!(join_depth_limited(&root, &["a", "b.c"]).is_ok());
        assert!(join_depth_limited(&root, &["a/../b"]).is_err());
        assert!(join_depth_limited(&root, &["a:b"]).is_err());
        assert!(join_depth_limited(&root, &["a\\b"]).is_err());
        assert!(join_depth_limited(&root, &[]).is_err());
    }

    #[test]
    fn rel_path_between_works() {
        let root = reset_workspace();
        let p = root.join("notes").join("n1").join("note.md");
        assert_eq!(rel_path_between(&root, &p).unwrap(), "notes/n1/note.md");
    }
}