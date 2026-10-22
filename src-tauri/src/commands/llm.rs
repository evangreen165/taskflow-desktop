use tauri::State;

use crate::error::AppError;
use crate::AppState;

/// Only http(s) endpoints are proxied (LLM providers, local Ollama, ...).
fn valid_http_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// Proxies an LLM API request on behalf of a plugin, bypassing browser CORS.
/// The raw provider JSON text is returned to the plugin.
#[tauri::command(rename = "llmProxyRequest")]
pub async fn llm_proxy_request(
    state: State<'_, AppState>,
    url: String,
    api_key: String,
    body: String,
) -> Result<String, AppError> {
    state.require_auth()?;
    if !valid_http_url(&url) {
        return Err(AppError::new("INVALID_INPUT", "url must be http(s)"));
    }
    if body.trim().is_empty() {
        return Err(AppError::new("INVALID_INPUT", "body must not be empty"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::new("NETWORK", e.to_string()))?;

    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }

    let response = request
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK", e.to_string()))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| AppError::new("NETWORK", e.to_string()))?;
    if !status.is_success() {
        return Err(AppError::new(
            "LLM_ERROR",
            format!("LLM provider returned {status}: {text}"),
        ));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_scheme_is_validated() {
        assert!(valid_http_url("https://openrouter.ai/api/v1/chat/completions"));
        assert!(valid_http_url("http://localhost:11434/v1/chat/completions"));
        assert!(!valid_http_url("file:///etc/passwd"));
        assert!(!valid_http_url("ftp://example.com/x"));
        assert!(!valid_http_url(""));
        assert!(!valid_http_url("javascript:alert(1)"));
    }
}
