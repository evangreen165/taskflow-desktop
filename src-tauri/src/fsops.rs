use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;

/// Relative (to the workspace root) location of an entry as returned by `list_dir`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirFilter {
    pub extensions: Option<Vec<String>>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHash {
    pub sha256: String,
    pub size: u64,
}

fn ensure_parent(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::io(format!("create dir '{}'", parent.display()), e))?;
    }
    Ok(())
}

/// Windows wide path with the extended-length (`\\?\`) prefix. Rust's std adds
/// this automatically, but the raw `MoveFileExW` call below does not, so paths
/// longer than `MAX_PATH` (common under deep personal-space directories) would
/// otherwise fail with `ERROR_PATH_NOT_FOUND`.
#[cfg(windows)]
fn wide_path(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    let is_prefixed = wide.len() >= 4
        && wide[0] == b'\\' as u16
        && wide[1] == b'\\' as u16
        && wide[2] == b'?' as u16
        && wide[3] == b'\\' as u16;
    if !is_prefixed {
        let is_unc = wide.len() >= 2 && wide[0] == b'\\' as u16 && wide[1] == b'\\' as u16;
        let mut prefixed: Vec<u16> = Vec::with_capacity(wide.len() + 8);
        if is_unc {
            prefixed.extend(r"\\?\UNC\".encode_utf16());
            prefixed.extend_from_slice(&wide[2..]);
        } else {
            prefixed.extend(r"\\?\".encode_utf16());
            prefixed.extend_from_slice(&wide);
        }
        wide = prefixed;
    }
    wide.push(0);
    wide
}

/// Atomically replaces `dst` with `src`.
///
/// `std::fs::rename` cannot overwrite an existing file on Windows, so the
/// platform specific `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` is used
/// there. Both are atomic on the same filesystem (which includes SMB).
pub fn atomic_replace(src: &Path, dst: &Path) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING};

        let src_wide = wide_path(src);
        let dst_wide = wide_path(dst);
        // SAFETY: wide NUL-terminated buffers live for the call duration.
        let ok = unsafe { MoveFileExW(src_wide.as_ptr(), dst_wide.as_ptr(), MOVEFILE_REPLACE_EXISTING) };
        if ok == 0 {
            let code = unsafe { GetLastError() };
            return Err(AppError::new(
                "IO",
                format!(
                    "atomic replace '{}' -> '{}' failed (win32 error {code})",
                    src.display(),
                    dst.display()
                ),
            ));
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        fs::rename(src, dst).map_err(|e| AppError::io("atomic replace", e))?;
        Ok(())
    }
}

fn temp_name_for(path: &Path) -> PathBuf {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    parent.join(format!(".taskflow-{name}.{}.tmp", Uuid::new_v4()))
}

/// Writes a temp sibling then atomically renames it over `path`.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    ensure_parent(path)?;
    let tmp = temp_name_for(path);
    let write_result = (|| -> Result<(), AppError> {
        let mut f = File::create(&tmp).map_err(|e| AppError::io("create temp", e))?;
        f.write_all(bytes).map_err(|e| AppError::io("write temp", e))?;
        f.sync_all().map_err(|e| AppError::io("sync temp", e))?;
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    if let Err(e) = atomic_replace(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(AppError::from)?;
    bytes.push(b'\n');
    write_atomic(path, &bytes)
}

pub fn write_text_atomic(path: &Path, text: &str) -> Result<(), AppError> {
    write_atomic(path, text.as_bytes())
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, AppError> {
    let bytes = fs::read(path).map_err(|e| AppError::io(format!("read '{}'", path.display()), e))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| AppError::parse(format!("parse '{}'", path.display()), &e))
}

pub fn read_text(path: &Path) -> Result<String, AppError> {
    fs::read_to_string(path)
        .map_err(|e| AppError::io(format!("read '{}'", path.display()), e))
}

/// Exclusive file creation: fails when the target already exists.
/// Used for registrations (users) which must never overwrite each other on a
/// shared folder.
pub fn create_exclusive(path: &Path, content: &[u8]) -> Result<(), AppError> {
    ensure_parent(path)?;
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                AppError::new("ALREADY_EXISTS", format!("'{}' already exists", path.display()))
            } else {
                AppError::io(format!("create exclusive '{}'", path.display()), e)
            }
        })?;
    f.write_all(content).map_err(|e| AppError::io("write exclusive", e))?;
    f.sync_all().map_err(|e| AppError::io("sync exclusive", e))?;
    Ok(())
}

pub fn remove_path(path: &Path) -> Result<(), AppError> {
    fs::remove_file(path).map_err(|e| AppError::io(format!("remove '{}'", path.display()), e))
}

pub fn path_exists(path: &Path) -> bool {
    path.exists()
}

fn fmt_time(t: Option<DateTime<Utc>>) -> Option<String> {
    t.map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

pub fn list_dir(root: &Path, dir_rel: &str, filter: &ListDirFilter) -> Result<Vec<DirEntry>, AppError> {
    let dir = if dir_rel.is_empty() || dir_rel == "." {
        root.to_path_buf()
    } else {
        crate::path::resolve_rel(root, dir_rel)?
    };
    let entries = fs::read_dir(&dir)
        .map_err(|e| AppError::io(format!("list '{}'", dir.display()), e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::io("read_dir", e))?;

    let include_hidden = filter.include_hidden.unwrap_or(false);
    let mut out = Vec::new();
    for entry in entries {
        let ft = entry.file_type().map_err(|e| AppError::io("file_type", e))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !include_hidden && name.starts_with('.') {
            continue;
        }
        if let Some(exts) = &filter.extensions {
            if !ft.is_dir() {
                if let Some(ext) = Path::new(&name).extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if !exts.iter().any(|e| e.to_lowercase() == ext) {
                        continue;
                    }
                } else {
                    continue;
                }
            }
        }
        let rel_path = if dir_rel.is_empty() || dir_rel == "." {
            name.clone()
        } else {
            format!("{dir_rel}/{name}")
        };
        let meta = entry.metadata().ok();
        out.push(DirEntry {
            name,
            path: rel_path,
            is_dir: ft.is_dir(),
            size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
            modified: fmt_time(meta.as_ref().and_then(|m| m.modified().ok()).map(From::from)),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// SHA-256 of a file with streaming reads (stable memory, big attachments).
pub fn hash_file(path: &Path) -> Result<FileHash, AppError> {
    let mut f = File::open(path).map_err(|e| AppError::io(format!("open '{}'", path.display()), e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| AppError::io("hash read", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok(FileHash { sha256: hex::encode(hasher.finalize()), size })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn write_and_read_json_roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a").join("b.json");
        write_json_atomic(&p, &serde_json::json!({ "x": 1 })).unwrap();
        let v: serde_json::Value = read_json(&p).unwrap();
        assert_eq!(v["x"], 1);
    }

    #[test]
    fn atomic_write_supports_paths_beyond_max_path() {
        let dir = tempdir().unwrap();
        let mut path = dir.path().to_path_buf();
        // Deep personal-space-like tree: the temp sibling pushes the path past
        // the Windows MAX_PATH limit.
        for _ in 0..8 {
            path.push("a".repeat(40));
        }
        path.push("history.json");
        write_json_atomic(&path, &serde_json::json!({ "ok": true })).unwrap();
        let v: serde_json::Value = read_json(&path).unwrap();
        assert_eq!(v["ok"], true);
    }

    #[test]
    fn atomic_write_overwrites_and_keeps_no_temp() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.json");
        write_text_atomic(&p, "one").unwrap();
        write_text_atomic(&p, "two").unwrap();
        assert_eq!(read_text(&p).unwrap(), "two");
        let remain: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(remain.len(), 1);
        assert_eq!(remain[0], "f.json");
    }

    #[test]
    fn create_exclusive_is_exclusive() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("u.json");
        create_exclusive(&p, b"{}").unwrap();
        let err = create_exclusive(&p, b"{}").unwrap_err();
        assert_eq!(err.code, "ALREADY_EXISTS");
        assert!(path_exists(&p));
    }

    #[test]
    fn list_dir_filters_extensions() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        fs::write(dir.path().join("b.json"), "{}").unwrap();
        let filter = ListDirFilter {
            extensions: Some(vec!["md".into()]),
            include_hidden: None,
        };
        let entries = list_dir(dir.path(), "", &filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "a.md");
        assert_eq!(entries[0].path, "a.md");
    }

    #[test]
    fn list_dir_hides_dotfiles_by_default() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(".hidden"), "x").unwrap();
        fs::write(dir.path().join("vis.json"), "x").unwrap();
        let entries = list_dir(dir.path(), "", &ListDirFilter::default()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "vis.json");
    }

    #[test]
    fn hash_file_matches_known_digest() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("bin.dat");
        fs::write(&p, b"hello world").unwrap();
        let h = hash_file(&p).unwrap();
        assert_eq!(
            h.sha256,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
        assert_eq!(h.size, 11);
    }
}