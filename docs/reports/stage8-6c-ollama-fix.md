# Stage 8.6c — Fix Ollama Connection (IPv4 & Proxy)

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(6c)`

## Problem

Ollama works from PowerShell but the Tauri app fails with
`error sending request for url (http://localhost:11434/v1/chat/completions)`.
Root cause on Windows: `localhost` commonly resolves to IPv6 (`::1`) first while
Ollama listens on IPv4 (`127.0.0.1`).

## Task 1 — IPv4 resolution

- The plugin now **defaults** the local provider to IPv4:
  - chat: `http://127.0.0.1:11434/v1/chat/completions`
  - models: `http://127.0.0.1:11434/api/tags`
- Defense in depth in Rust (`commands/llm.rs`): `send_with_ipv4_retry` — if a
  request to an `http://localhost:…` URL fails, it **retries the same request
  against `http://127.0.0.1:…`** automatically (logs the retry with
  `tracing::warn!`). This fixes the IPv6-first issue even when the URL still
  says `localhost`.

## Task 2 — Bridge routing & error tracing

- Verified the plugin **does not use `window.fetch`**: it routes through
  `callPlugin("llmChat", { url, apiKey, body })` and
  `callPlugin("llmGet", { url })` → Rust `reqwest` (no CORS).
- `llm_proxy_request` / `llm_proxy_get` log the exact error with
  `tracing::error!`:
  - send failure (`url`, `error`);
  - body-read failure (`url`, `status`, `error`);
  - non-2xx provider response (`url`, `status`, `body`).
- Connection errors now return `LLM_ERROR` with the raw reqwest message, so the
  plugin shows precisely why the connection failed (e.g. connection refused ⇒
  Ollama is not running).

## Task 3 — Capabilities

`llm_proxy_request` is a **custom command** invoked over Tauri IPC (it uses
`reqwest` directly, not `tauri-plugin-http`). Custom commands are not gated by
the `http` plugin permissions, so **no `http:default` / `http:allow-fetch`
capability is required**; `src-tauri/capabilities/default.json` was left
unchanged.

## Task 4 — UI warning

The plugin settings show the hint for the Local provider:

> Убедитесь, что Ollama запущена. При ошибке используйте 127.0.0.1 вместо
> localhost.

## How to test

1. Update the plugin in the workspace (`plugins/llm-assistant/index.html`).
2. Ensure Ollama is running (`ollama serve`) and a model is pulled
   (`ollama pull qwen2.5:7b`).
3. ⚙ Настройки → Provider **Local (Ollama)** (URL already `http://127.0.0.1:11434/v1/chat/completions`) → «Загрузить список моделей» → pick `qwen2.5:7b`.
4. Send a message — it should answer. If it still fails, the app log shows the
   exact reqwest error and the IPv4 retry trace.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **160 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/llm.rs                  (IPv4 retry + LLM_ERROR logging + test)
plugins/llm-assistant/index.html               (127.0.0.1 defaults + Ollama hint)
docs/reports/stage8-6c-ollama-fix.md           (this report)
```

## Known limitations / follow-ups

- The IPv4 retry only kicks in for `http://localhost:` URLs; the plugin already
  uses `127.0.0.1` by default.
- Ollama must actually be running and listening on `127.0.0.1:11434`; the new
  logs distinguish "connection refused" (Ollama down) from provider errors.
