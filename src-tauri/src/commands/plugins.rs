use tauri::State;

use crate::error::AppError;
use crate::plugins::{self, PluginManifest};
use crate::AppState;

/// Lists installed plugins (their manifests) from `{workspace}/plugins/`.
pub fn plugins_list_impl(state: &AppState) -> Result<Vec<PluginManifest>, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    plugins::list(&root)
}

#[tauri::command(rename = "pluginsList")]
pub fn plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginManifest>, AppError> {
    plugins_list_impl(&state)
}

/// Reads a plugin's entry HTML (for a sandboxed iframe via `srcdoc`).
pub fn plugin_get_content_impl(state: &AppState, plugin_id: String) -> Result<String, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    plugins::read_content(&root, &plugin_id)
}

#[tauri::command(rename = "pluginGetContent")]
pub fn plugin_get_content(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<String, AppError> {
    plugin_get_content_impl(&state, plugin_id)
}
