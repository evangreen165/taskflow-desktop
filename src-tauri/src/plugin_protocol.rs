use std::path::Path;

use tauri::http::{Request, Response, StatusCode};

use crate::error::AppError;
use crate::AppState;

const NOT_FOUND: &[u8] = b"Not found";

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(NOT_FOUND.to_vec())
        .unwrap()
}

/// Serves `{workspace}/plugins/{plugin_id}/{path}` for the `plugin://` scheme.
///
/// WebView2 rewrites custom protocols to `http://plugin.localhost/...`, so both
/// `plugin://<id>/<path>` (host = id) and `http://plugin.localhost/<id>/<path>`
/// (host = plugin.localhost) are supported. The plugin id and the relative path
/// are validated with `path::resolve_rel` (no `..`, no absolute paths).
pub fn handle(state: &AppState, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = request.uri();
    let host = uri.host().unwrap_or("");
    let raw_path = uri.path().trim_start_matches('/');

    let (plugin_id, relative) =
        if host.is_empty() || host == "plugin.localhost" || host == "localhost" {
            // Windows style: /<plugin_id>/<relative>
            match raw_path.split_once('/') {
                Some((id, rest)) => (id.to_string(), rest.to_string()),
                None => (raw_path.to_string(), "index.html".to_string()),
            }
        } else {
            // plugin://<plugin_id>/<relative>
            (host.to_string(), raw_path.to_string())
        };
    let relative = if relative.is_empty() {
        "index.html".to_string()
    } else {
        relative
    };

    let result = (|| -> Result<Vec<u8>, AppError> {
        let root = state.root()?;
        let plugin_dir = crate::path::resolve_rel(&root, &format!("plugins/{plugin_id}"))?;
        let file = crate::path::resolve_rel(&plugin_dir, &relative)?;
        if !file.is_file() {
            return Err(AppError::new("NOT_FOUND", "plugin file not found"));
        }
        std::fs::read(&file).map_err(|e| AppError::io("read plugin asset", e))
    })();

    match result {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime_for(Path::new(&relative)))
            .header("Cache-Control", "no-store")
            .body(bytes)
            .unwrap_or_else(|_| not_found()),
        Err(err) => {
            tracing::warn!(
                plugin = %plugin_id,
                path = %relative,
                error = %err.message,
                "plugin protocol request failed"
            );
            not_found()
        }
    }
}
