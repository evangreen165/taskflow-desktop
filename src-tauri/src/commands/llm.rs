use tauri::State;

use crate::error::AppError;
use crate::AppState;

/// Only http(s) endpoints are proxied (LLM providers, local Ollama, ...).
fn valid_http_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// OpenRouter (and some other providers) expect these two headers on every
/// request; they are harmless for local endpoints like Ollama.
fn add_provider_headers(request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request
        .header("HTTP-Referer", "https://github.com/evangreen165/taskflow-desktop")
        .header("X-Title", "TaskFlow")
}

fn build_client(timeout_secs: u64) -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::new("NETWORK", e.to_string()))
}

/// Proxies an LLM chat request on behalf of a plugin, bypassing browser CORS.
/// Returns the raw provider JSON text.
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

    let client = build_client(120)?;
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body);
    request = add_provider_headers(request);
    // Ollama (local) ignores/does not expect an Authorization header.
    let is_local = url.contains("localhost") || url.contains("127.0.0.1");
    if !is_local && !api_key.is_empty() {
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

/// GET proxy (e.g. `https://openrouter.ai/api/v1/models`) so plugins can load
/// dynamic model lists without CORS.
#[tauri::command(rename = "llmProxyGet")]
pub async fn llm_proxy_get(
    state: State<'_, AppState>,
    url: String,
) -> Result<String, AppError> {
    state.require_auth()?;
    if !valid_http_url(&url) {
        return Err(AppError::new("INVALID_INPUT", "url must be http(s)"));
    }

    let client = build_client(60)?;
    let request = add_provider_headers(client.get(&url));
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
            format!("provider returned {status}: {text}"),
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
