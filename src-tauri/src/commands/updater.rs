use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::fsops;
use crate::AppState;

/// Update described by `updates/update.json` in the workspace root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineUpdate {
    pub version: String,
    pub notes: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

fn version_parts(version: &str) -> Option<(u64, u64, u64)> {
    let core = version
        .trim()
        .trim_start_matches('v')
        .split(['-', '+'])
        .next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

/// True when `candidate` is a strictly higher `major.minor.patch` version.
/// Unparseable versions never count as newer.
fn is_newer(candidate: &str, current: &str) -> bool {
    match (version_parts(candidate), version_parts(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
}

/// Checks `{workspace}/updates/update.json` for a version newer than the
/// running app. Missing files and unparseable versions return `None`.
pub fn check_offline_update_impl(
    root: &Path,
    current_version: &str,
) -> Result<Option<OfflineUpdate>, AppError> {
    let path = root.join("updates").join("update.json");
    if !path.is_file() {
        return Ok(None);
    }
    let manifest: UpdateManifest = fsops::read_json(&path)?;
    let version = manifest.version.trim().to_string();
    if version.is_empty() || !is_newer(&version, current_version) {
        return Ok(None);
    }
    Ok(Some(OfflineUpdate {
        version,
        notes: manifest.notes,
        path: manifest.path,
    }))
}

#[tauri::command(rename = "checkOfflineUpdate")]
pub fn check_offline_update(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<OfflineUpdate>, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    let current = app.package_info().version.to_string();
    check_offline_update_impl(&root, &current)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_manifest(dir: &Path, value: serde_json::Value) {
        let updates = dir.join("updates");
        std::fs::create_dir_all(&updates).unwrap();
        fsops::write_json_atomic(&updates.join("update.json"), &value).unwrap();
    }

    #[test]
    fn missing_manifest_means_no_update() {
        let dir = tempdir().unwrap();
        assert!(check_offline_update_impl(dir.path(), "0.6.0")
            .unwrap()
            .is_none());
    }

    #[test]
    fn newer_version_is_returned() {
        let dir = tempdir().unwrap();
        write_manifest(
            dir.path(),
            serde_json::json!({
                "version": "0.7.0",
                "notes": "Stage 7",
                "path": "updates/TaskFlow_0.7.0_x64-setup.exe",
            }),
        );
        let update = check_offline_update_impl(dir.path(), "0.6.0")
            .unwrap()
            .unwrap();
        assert_eq!(update.version, "0.7.0");
        assert_eq!(update.notes.as_deref(), Some("Stage 7"));
        assert_eq!(
            update.path.as_deref(),
            Some("updates/TaskFlow_0.7.0_x64-setup.exe")
        );
    }

    #[test]
    fn same_or_older_version_is_ignored() {
        let dir = tempdir().unwrap();
        write_manifest(dir.path(), serde_json::json!({ "version": "0.6.0" }));
        assert!(check_offline_update_impl(dir.path(), "0.6.0")
            .unwrap()
            .is_none());
        write_manifest(dir.path(), serde_json::json!({ "version": "0.5.9" }));
        assert!(check_offline_update_impl(dir.path(), "0.6.0")
            .unwrap()
            .is_none());
    }

    #[test]
    fn version_comparison_handles_prefixes_and_prereleases() {
        assert!(is_newer("v0.7.0", "0.6.9"));
        assert!(is_newer("1.0.0-beta.1", "0.9.9"));
        assert!(!is_newer("0.6.0", "0.6.0"));
        assert!(!is_newer("not-a-version", "0.6.0"));
    }
}
