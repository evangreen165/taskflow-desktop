# Stage 8.6b — Async Performance & Ollama Proxy Fix

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(6b)`

## Task 1 — Async offloading (freeze fix)

Stage 8.6 already converted the network and folder-scanning commands
(`llmProxyRequest`, `llmProxyGet`, `checkOfflineUpdate`, `pluginsList`,
`pluginGetContent`, `attachmentAdd`, `attachmentGetBase64`,
`attachmentRemove`). 8.6b extends the audit to the **generic file I/O surface**:

| Command                               | Before | After                                                                          |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `readJson` / `readText`               | sync   | `async fn` + `spawn_blocking`                                                  |
| `exists`                              | sync   | `async fn` + `spawn_blocking`                                                  |
| `listDir`                             | sync   | `async fn` + `spawn_blocking`                                                  |
| `hashFile`                            | sync   | `async fn` + `spawn_blocking`                                                  |
| `writeJsonAtomic` / `writeTextAtomic` | sync   | `async fn` + `spawn_blocking`                                                  |
| `createExclusive` / `removePath`      | sync   | `async fn` + `spawn_blocking`                                                  |
| `notesImport`                         | sync   | `async fn` + `spawn_blocking` (import logic extracted into `import_from_disk`) |

- The `write_command` macro is compatible with `async fn` (it only injects the
  `require_writable` guard).
- `_impl` helpers are kept (the `lib.rs` permission tests call them directly).
- Lock commands (`acquireLock`, `releaseLock`, `isLocked`) write tiny lock files
  and were left sync; they are fast even on SMB.

### Watcher

`watcher.rs` was verified: `notify` runs on its own thread and the debounce loop
is `thread::spawn`ed — it never blocks the main event loop.

## Task 2 — Ollama proxy connection

- The plugin's Local provider strictly defaults the URL to
  `http://localhost:11434/v1/chat/completions`.
- `llm_proxy_request` now skips the `Authorization` header when the URL contains
  `localhost`/`127.0.0.1`, **or** the API key is empty / equals `"ollama"`.
- Detailed `tracing::error!` logging was added in `llmProxyRequest` and
  `llmProxyGet` for:
  - the send failure (`error sending request for url` — the exact reqwest error,
    e.g. connection refused ⇒ Ollama is not running or the host/port is wrong);
  - body-read failures;
  - non-2xx provider responses (with the body).
- CORS does not apply — the request goes through Rust, so the only remaining
  cause of "error sending request for url" is connectivity (Ollama stopped /
  wrong host / firewall).

## Task 3 — Model selector

The plugin already uses a **searchable combobox** (custom dropdown with a search
input, batched list rendering) instead of a native `<select>`:

- **Cloud**: models from `https://openrouter.ai/api/v1/models` + «Только
  бесплатные» filter.
- **Local**: models from `http://localhost:11434/api/tags` (shows exact Ollama
  tag names like `qwen2.5:7b`).

## How to test

1. Update the plugin in the workspace (`plugins/llm-assistant/index.html`).
2. Run with Ollama started (`ollama serve`) and a model pulled
   (`ollama pull qwen2.5:7b`).
3. ⚙ Настройки → Provider **Local (Ollama)** → «Загрузить список моделей» →
   pick `qwen2.5:7b` → save.
4. Send a message. With a large SMB transfer in progress the UI should stay
   responsive; if the request fails, the app log (`tracing::error!`) shows the
   exact reqwest error (connection refused ⇒ Ollama down).
5. Cloud still works with an OpenRouter key + a `:free` model.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **159 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/storage.rs    (reads/writes/list/hash/exists → async)
src-tauri/src/commands/notes.rs      (notesImport → async + import_from_disk)
src-tauri/src/commands/llm.rs        (Authorization skip + tracing::error!)
docs/reports/stage8-6b-async-ollama.md (this report)
```

## Known limitations / follow-ups

- Lock commands remain sync (tiny files); convert them if SMB lock latency ever
  shows up in profiling.
- Other per-entity commands (tasks/notes writes) still do small file writes on
  the runtime; the "large file transfer" paths (imports, attachments, hashing,
  generic storage) are now off-thread.
- The Ollama connectivity error depends on Ollama actually running; the log now
  distinguishes connection errors from provider errors.
