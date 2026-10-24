use std::path::Path;

use tauri::http::{Request, Response, StatusCode, Uri};

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
        "js" | "mjs" => "application/javascript; charset=utf-8",
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

/// Resolves the `(plugin_id, relative_path)` pair from a request URI.
///
/// Supported forms (each maps to `{workspace}/plugins/{plugin_id}/{relative}`):
/// - `plugin://<plugin_id>/<path>` — macOS/Linux custom-scheme URL;
/// - `plugin://localhost/<plugin_id>/<path>` — canonical cross-platform URL
///   (Tauri serves custom protocols from `{scheme}://localhost` off Windows);
/// - `http://plugin.localhost/<plugin_id>/<path>` — the WebView2 rewrite on
///   Windows (Tauri maps the scheme to `http://{scheme}.localhost`, dropping
///   the original host, so the plugin id arrives as the first path segment).
pub fn split_route(uri: &Uri) -> (String, String) {
    let host = uri.host().unwrap_or("");
    let raw_path = uri.path().trim_start_matches('/');

    let (plugin_id, relative) =
        if host.is_empty() || host == "plugin.localhost" || host == "localhost" {
            // Windows style (or bare path): /<plugin_id>/<relative>
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
    (plugin_id, relative)
}

/// Serves `{workspace}/plugins/{plugin_id}/{path}` for the `plugin://` scheme.
///
/// WebView2 rewrites custom protocols to `http://plugin.localhost/...` on
/// Windows, so both `plugin://localhost/<id>/<path>` (host = localhost) and
/// `http://plugin.localhost/<id>/<path>` (host = plugin.localhost) are
/// supported. The plugin id and the relative path are validated with
/// `path::resolve_rel` (no `..`, no absolute paths).
pub fn handle(state: &AppState, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let (plugin_id, relative) = split_route(request.uri());

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;
    use tempfile::tempdir;

    fn uri(value: &str) -> Uri {
        value.parse().unwrap()
    }

    #[test]
    fn routes_all_platform_uri_forms() {
        assert_eq!(
            split_route(&uri("plugin://localhost/llm-assistant/index.html")),
            ("llm-assistant".to_string(), "index.html".to_string())
        );
        assert_eq!(
            split_route(&uri("http://plugin.localhost/llm-assistant/index.html")),
            ("llm-assistant".to_string(), "index.html".to_string())
        );
        assert_eq!(
            split_route(&uri("plugin://llm-assistant/index.html")),
            ("llm-assistant".to_string(), "index.html".to_string())
        );
        assert_eq!(
            split_route(&uri("plugin://localhost/llm-assistant/style.css")),
            ("llm-assistant".to_string(), "style.css".to_string())
        );
        assert_eq!(
            split_route(&uri("http://plugin.localhost/llm-assistant/")),
            ("llm-assistant".to_string(), "index.html".to_string())
        );
        assert_eq!(
            split_route(&uri("plugin://localhost/llm-assistant")),
            ("llm-assistant".to_string(), "index.html".to_string())
        );
    }

    #[test]
    fn mime_types_cover_plugin_assets() {
        assert_eq!(mime_for(Path::new("index.html")), "text/html; charset=utf-8");
        assert_eq!(mime_for(Path::new("style.css")), "text/css; charset=utf-8");
        assert_eq!(
            mime_for(Path::new("index.js")),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(
            mime_for(Path::new("app.mjs")),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(mime_for(Path::new("unknown.bin")), "application/octet-stream");
    }

    fn plugin_request(uri: &str) -> Request<Vec<u8>> {
        Request::builder().uri(uri).body(Vec::new()).unwrap()
    }

    #[test]
    fn serves_plugin_files_with_correct_content_type() {
        let dir = tempdir().unwrap();
        let info = crate::workspace::init(dir.path(), "Plugins").unwrap();
        let plugin_dir = dir.path().join("plugins").join("llm-assistant");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(plugin_dir.join("index.html"), "<h1>hi</h1>").unwrap();
        std::fs::write(plugin_dir.join("index.js"), "console.log('ok')").unwrap();

        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        let html = handle(&state, &plugin_request("plugin://localhost/llm-assistant/index.html"));
        assert_eq!(html.status(), StatusCode::OK);
        assert_eq!(
            html.headers().get("Content-Type").unwrap(),
            "text/html; charset=utf-8"
        );
        assert_eq!(html.body(), b"<h1>hi</h1>");

        // Windows WebView2 rewrite form.
        let js = handle(&state, &plugin_request("http://plugin.localhost/llm-assistant/index.js"));
        assert_eq!(js.status(), StatusCode::OK);
        assert_eq!(
            js.headers().get("Content-Type").unwrap(),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(js.body(), b"console.log('ok')");
    }

    #[test]
    fn missing_plugin_or_file_returns_not_found() {
        let dir = tempdir().unwrap();
        let info = crate::workspace::init(dir.path(), "Plugins").unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);

        let missing_plugin =
            handle(&state, &plugin_request("plugin://localhost/unknown/index.html"));
        assert_eq!(missing_plugin.status(), StatusCode::NOT_FOUND);

        let missing_file =
            handle(&state, &plugin_request("plugin://localhost/missing/missing.js"));
        assert_eq!(missing_file.status(), StatusCode::NOT_FOUND);

        // Traversal is rejected by path::resolve_rel.
        let traversal =
            handle(&state, &plugin_request("plugin://localhost/../secret/index.html"));
        assert_eq!(traversal.status(), StatusCode::NOT_FOUND);
    }
}
