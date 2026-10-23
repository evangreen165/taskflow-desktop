use tauri::State;

use crate::error::AppError;
use crate::plugins::{self, PluginManifest};
use crate::AppState;

/// Lists installed plugins (their manifests) from `{workspace}/plugins/`.
/// Runs on a blocking thread so scanning an SMB folder never freezes the UI.
#[tauri::command(rename = "pluginsList")]
pub async fn plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginManifest>, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    tokio::task::spawn_blocking(move || plugins::list(&root))
        .await
        .map_err(|e| AppError::new("IO", format!("plugins scan failed: {e}")))?
}

/// Reads a plugin's entry HTML (for a sandboxed iframe via `srcdoc`).
#[tauri::command(rename = "pluginGetContent")]
pub async fn plugin_get_content(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<String, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    tokio::task::spawn_blocking(move || plugins::read_content(&root, &plugin_id))
        .await
        .map_err(|e| AppError::new("IO", format!("plugin read failed: {e}")))?
}
