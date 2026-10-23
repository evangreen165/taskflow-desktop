use std::error::Error;

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
        // VPN / corporate proxies must never intercept localhost (Ollama) or
        // add latency to LLM calls.
        .no_proxy()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::new("NETWORK", e.to_string()))
}

/// Detailed log of a reqwest failure: connection vs timeout, the error text
/// and the root cause chain (helps diagnose IPv6/proxy issues).
fn log_reqwest_error(err: &reqwest::Error, url: &str) {
    let source = err
        .source()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "-".to_string());
    tracing::error!(
        url = %url,
        is_connect = err.is_connect(),
        is_timeout = err.is_timeout(),
        source = %source,
        error = %err,
        "llm proxy request failed"
    );
}

/// On Windows, `localhost` often resolves to IPv6 (`::1`) while Ollama listens
/// on IPv4 (`127.0.0.1`). When the first attempt fails on a `localhost` URL we
/// retry the same request against `127.0.0.1`.
fn retry_url_with_ipv4(url: &str) -> Option<String> {
    if url.starts_with("http://localhost:") {
        return Some(url.replacen("http://localhost", "http://127.0.0.1", 1));
    }
    None
}

/// Sends a request built by `build`, retrying once over IPv4 when the host is
/// `localhost`. Logs the exact reqwest error on failure.
async fn send_with_ipv4_retry(
    client: &reqwest::Client,
    url: &str,
    build: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, AppError> {
    let mut target = url.to_string();
    for attempt in 0..2u8 {
        let request = build(client, &target);
        match request.send().await {
            Ok(response) => return Ok(response),
            Err(err) if attempt == 0 => {
                if let Some(fallback) = retry_url_with_ipv4(&target) {
                    tracing::warn!(from = %target, to = %fallback, "retrying llm request over IPv4");
                    target = fallback;
                    continue;
                }
                log_reqwest_error(&err, &url);
                return Err(AppError::new("LLM_ERROR", err.to_string()));
            }
            Err(err) => {
                log_reqwest_error(&err, &target);
                return Err(AppError::new("LLM_ERROR", err.to_string()));
            }
        }
    }
    unreachable!()
}

async fn response_text(response: reqwest::Response, url: &str) -> Result<String, AppError> {
    let status = response.status();
    let text = match response.text().await {
        Ok(text) => text,
        Err(err) => {
            tracing::error!(url = %url, status = %status.as_u16(), error = %err, "llm proxy read body failed");
            return Err(AppError::new("NETWORK", err.to_string()));
        }
    };
    if !status.is_success() {
        tracing::error!(url = %url, status = %status.as_u16(), body = %text, "llm provider returned an error");
        return Err(AppError::new(
            "LLM_ERROR",
            format!("LLM provider returned {status}: {text}"),
        ));
    }
    Ok(text)
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
    let response = send_with_ipv4_retry(&client, &url, |client, target| {
        let mut request = client
            .post(target)
            .header("Content-Type", "application/json")
            .body(body.clone());
        request = add_provider_headers(request);
        // Ollama (local) ignores/does not expect an Authorization header; also
        // skip empty or "ollama" placeholder keys.
        let is_local = target.contains("localhost") || target.contains("127.0.0.1");
        let has_key = !api_key.is_empty() && !api_key.eq_ignore_ascii_case("ollama");
        if !is_local && has_key {
            request = request.header("Authorization", format!("Bearer {api_key}"));
        }
        request
    })
    .await?;
    response_text(response, &url).await
}

/// GET proxy (e.g. `https://openrouter.ai/api/v1/models` or
/// `http://127.0.0.1:11434/api/tags`) so plugins can load model lists without
/// CORS.
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
    let response = send_with_ipv4_retry(&client, &url, |client, target| {
        add_provider_headers(client.get(target))
    })
    .await?;
    response_text(response, &url).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_scheme_is_validated() {
        assert!(valid_http_url("https://openrouter.ai/api/v1/chat/completions"));
        assert!(valid_http_url("http://127.0.0.1:11434/v1/chat/completions"));
        assert!(!valid_http_url("file:///etc/passwd"));
        assert!(!valid_http_url("ftp://example.com/x"));
        assert!(!valid_http_url(""));
        assert!(!valid_http_url("javascript:alert(1)"));
    }

    #[test]
    fn localhost_is_retried_over_ipv4() {
        assert_eq!(
            retry_url_with_ipv4("http://localhost:11434/v1/chat/completions"),
            Some("http://127.0.0.1:11434/v1/chat/completions".to_string())
        );
        assert_eq!(retry_url_with_ipv4("http://localhost:11434/api/tags"),
            Some("http://127.0.0.1:11434/api/tags".to_string()));
        assert_eq!(retry_url_with_ipv4("http://127.0.0.1:11434/v1/chat/completions"), None);
        assert_eq!(retry_url_with_ipv4("https://openrouter.ai/api/v1/models"), None);
    }
}
