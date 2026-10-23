use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fsops;

/// Manifest that every plugin folder must contain.
///
/// `permissions` is a declaration of what the plugin intends to use; actual
/// gating will be implemented in a later SDK stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Where the plugin wants its UI injected ("sidebar" | "topbar" | "floating").
    #[serde(default)]
    pub ui: Option<PluginUi>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUi {
    pub inject: String,
}

fn default_entry() -> String {
    "index.html".to_string()
}

/// Plugin ids are folder names: lowercase letters, digits, `-`, `_`, `.`,
/// at most 64 characters.
pub fn valid_plugin_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| {
            c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_' | '.')
        })
}

fn plugins_dir(root: &Path) -> PathBuf {
    root.join("plugins")
}

/// Resolves `plugins/{plugin_id}` with traversal safety.
fn plugin_dir(root: &Path, plugin_id: &str) -> Result<PathBuf, AppError> {
    if !valid_plugin_id(plugin_id) {
        return Err(AppError::new("INVALID_INPUT", "invalid plugin id"));
    }
    crate::path::resolve_rel(root, &format!("plugins/{plugin_id}"))
}

/// Scans `{workspace}/plugins/` and returns the manifests of valid plugins.
/// Folders without a valid `manifest.json` are skipped.
pub fn list(root: &Path) -> Result<Vec<PluginManifest>, AppError> {
    let dir = plugins_dir(root);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut manifests = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| AppError::io("read plugins dir", e))? {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if !valid_plugin_id(&folder) {
            continue;
        }
        let Ok(manifest) = fsops::read_json::<PluginManifest>(&entry.path().join("manifest.json"))
        else {
            continue;
        };
        if manifest.id != folder || manifest.id.is_empty() || manifest.name.is_empty() {
            continue;
        }
        manifests.push(manifest);
    }
    manifests.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(manifests)
}

/// Reads the plugin's entry file (default `index.html`) as a string, for
/// injection into a sandboxed iframe via `srcdoc`.
pub fn read_content(root: &Path, plugin_id: &str) -> Result<String, AppError> {
    let dir = plugin_dir(root, plugin_id)?;
    let manifest: PluginManifest = fsops::read_json(&dir.join("manifest.json"))?;
    if manifest.id != plugin_id || manifest.name.is_empty() {
        return Err(AppError::new(
            "INVALID_INPUT",
            "plugin manifest does not match the folder",
        ));
    }
    let entry = manifest.entry.trim();
    let entry = if entry.is_empty() { "index.html" } else { entry };
    // The entry must stay inside the plugin folder (rejects `..` and absolute).
    let file = crate::path::resolve_rel(&dir, entry)?;
    if !file.is_file() {
        return Err(AppError::new("NOT_FOUND", "plugin entry file does not exist"));
    }
    fsops::read_text(&file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_manifest(dir: &Path, plugin_id: &str, manifest: serde_json::Value) {
        let plugin_dir = dir.join("plugins").join(plugin_id);
        std::fs::create_dir_all(&plugin_dir).unwrap();
        fsops::write_json_atomic(&plugin_dir.join("manifest.json"), &manifest).unwrap();
    }

    #[test]
    fn lists_valid_plugins_and_skips_garbage() {
        let dir = tempdir().unwrap();
        write_manifest(
            dir.path(),
            "notes-graph",
            serde_json::json!({
                "id": "notes-graph",
                "name": "Граф заметок",
                "version": "1.0.0",
                "entry": "index.html",
                "permissions": ["read_notes"],
                "ui": { "inject": "sidebar" },
            }),
        );
        // A folder without a manifest.
        std::fs::create_dir_all(dir.path().join("plugins").join("empty")).unwrap();
        // A folder whose name is not a valid plugin id.
        std::fs::create_dir_all(dir.path().join("plugins").join("bad id")).unwrap();

        let plugins = list(dir.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].id, "notes-graph");
        assert_eq!(plugins[0].name, "Граф заметок");
        assert_eq!(plugins[0].entry, "index.html");
        assert_eq!(plugins[0].permissions, vec!["read_notes".to_string()]);
        assert_eq!(
            plugins[0].ui.as_ref().map(|ui| ui.inject.as_str()),
            Some("sidebar")
        );
    }

    #[test]
    fn missing_plugins_folder_returns_empty() {
        let dir = tempdir().unwrap();
        assert!(list(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn reads_entry_content_and_validates_plugin_id() {
        let dir = tempdir().unwrap();
        write_manifest(
            dir.path(),
            "my-graph",
            serde_json::json!({ "id": "my-graph", "name": "Граф", "version": "1.0.0" }),
        );
        std::fs::write(
            dir.path().join("plugins").join("my-graph").join("index.html"),
            "<h1>Hello</h1>",
        )
        .unwrap();
        assert_eq!(read_content(dir.path(), "my-graph").unwrap(), "<h1>Hello</h1>");

        // Traversal in the plugin id is rejected.
        assert_eq!(
            read_content(dir.path(), "../my-graph").unwrap_err().code,
            "INVALID_INPUT"
        );
        // Unknown plugin -> IO error from the missing manifest.
        assert!(read_content(dir.path(), "nope").is_err());
    }

    #[test]
    fn rejects_manifest_mismatch_and_missing_entry() {
        let dir = tempdir().unwrap();
        write_manifest(
            dir.path(),
            "a",
            serde_json::json!({ "id": "different", "name": "X", "version": "1.0.0" }),
        );
        assert!(list(dir.path()).unwrap().is_empty());
        assert_eq!(
            read_content(dir.path(), "a").unwrap_err().code,
            "INVALID_INPUT"
        );

        write_manifest(
            dir.path(),
            "b",
            serde_json::json!({
                "id": "b",
                "name": "Y",
                "version": "1.0.0",
                "entry": "missing.html",
            }),
        );
        assert_eq!(
            read_content(dir.path(), "b").unwrap_err().code,
            "NOT_FOUND"
        );
    }
}
