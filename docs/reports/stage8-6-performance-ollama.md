# Stage 8.6 — Async Performance & Ollama Provider Fix

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(6)`

## Critical bug 1 — UI freezes during network/file load

### Audit: async offloading

Tauri commands that hit the network or the SMB filesystem were audited and
moved off the async runtime with `tokio::task::spawn_blocking`:

| Command                                                      | Before                    | After                                                   |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------- |
| `llmProxyRequest` / `llmProxyGet`                            | already `async` (reqwest) | unchanged — never blocked the UI                        |
| `checkOfflineUpdate`                                         | sync `fn`                 | `async fn` + `spawn_blocking` (manifest read)           |
| `pluginsList` / `pluginGetContent`                           | sync `fn`                 | `async fn` + `spawn_blocking` (folder scan / file read) |
| `attachmentAdd` / `attachmentGetBase64` / `attachmentRemove` | sync `fn`                 | `async fn` + `spawn_blocking` (copy / base64 / delete)  |

- `tokio = { version = "1", features = ["rt"] }` added as a direct dependency.
- `attachmentOpen` stays sync (just delegates to the OS opener).

### Frontend: model selector

The plugin no longer renders 400+ options in a native `<select>`. It now uses a
**custom searchable combobox**: a button opens a panel with a search input and a
scrollable, filtered list (rendered in batches up to 200 rows). This keeps the
DOM light even with 468+ OpenRouter models.

## Bug 2 — Ollama model 404 & provider separation

The plugin now has a **Provider** dropdown:

- **Cloud (OpenRouter)**:
  - models loaded from `https://openrouter.ai/api/v1/models` (`data[].id`);
  - «Только бесплатные» checkbox filters `:free` models.
- **Local (Ollama)**:
  - models loaded from `http://localhost:11434/api/tags` (`models[].name`, e.g.
    `qwen2.5:7b`, `llama3:latest`);
  - API URL switches to `http://localhost:11434/v1/chat/completions`;
  - API key is cleared and the «free only» filter is hidden.

The model selector is shared: cloud shows OpenRouter ids, local shows the exact
Ollama tag names, so the plugin never sends an OpenRouter id to Ollama.

## Task 3 — Bridge for Ollama

- `llm_proxy_request` skips the `Authorization` header when the URL contains
  `localhost` / `127.0.0.1` (Ollama ignores it, but the request stays clean).
- The chat payload is already `{ "model": "<local-name>", "messages": [...] }`,
  which matches Ollama's OpenAI-compatible `/v1/chat/completions` endpoint.
- `HTTP-Referer` / `X-Title` headers remain for OpenRouter and are harmless for
  local endpoints.

## How to test

1. Update the plugin in the workspace (`plugins/llm-assistant/index.html`).
2. Open the app → 🧩 FAB → ⚙ Настройки.
3. **Cloud**: provider «Cloud (OpenRouter)» → paste API key → «Загрузить список
   моделей» → search/filter a `:free` model → save → chat.
4. **Local**: provider «Local (Ollama)» → «Загрузить список моделей» (reads
   `http://localhost:11434/api/tags`) → pick e.g. `qwen2.5:7b` → save → chat.
   The app should no longer freeze while the request runs, and no 404 from wrong
   model ids.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **159 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/Cargo.toml                        (tokio)
src-tauri/src/commands/llm.rs               (skip Authorization for localhost)
src-tauri/src/commands/plugins.rs           (async + spawn_blocking)
src-tauri/src/commands/updater.rs           (async + spawn_blocking)
src-tauri/src/commands/attachments.rs       (async + spawn_blocking)
plugins/llm-assistant/index.html            (provider separation + searchable model list)
docs/reports/stage8-6-performance-ollama.md (this report)
```

## Known limitations / follow-ups

- The file-scanned commands now spawn blocking tasks; a saturated SMB share can
  still queue tasks, but the UI thread stays responsive.
- The model combobox caps rendering at 200 rows; searching narrows the rest.
- Ollama must be running for the local model list to load; the plugin shows a
  hint when the tags endpoint is unreachable.
