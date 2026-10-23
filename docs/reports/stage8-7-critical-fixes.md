# Stage 8.7 — Critical Fixes: LLM Proxy, Modal State, SMB Performance

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(7)`

## Bug 1 — Ollama connection fails in Rust (reqwest)

- `build_client` now calls **`.no_proxy()`**, so VPN/corporate proxies never
  intercept localhost (Ollama) or add latency to LLM calls.
- The IPv4 retry from 8.6c stays (`http://localhost:…` → `127.0.0.1` on
  connect failure).
- Detailed failure logging (`log_reqwest_error`): logs `is_connect`,
  `is_timeout`, the `error` text **and the `source()` chain**, so the exact
  failure (connection refused / DNS / proxy / IPv6) is visible in the app log.

## Bug 2 — Plugin modal unmounts and cancels LLM generation

- The modal no longer unmounts on outside click. `WorkspaceLayout` now tracks
  `activePluginId` (mounted) and `pluginPanelOpen` (visible) separately.
- Closing (outside click / «Свернуть») hides the modal with a CSS class
  (`display: none`), so the **iframe stays alive** and an in-flight LLM request
  keeps running.
- Reopening the same plugin just shows the panel again; opening a different
  plugin swaps the mounted frame.
- New bridge action **`setBusy`** (`{ busy }`) → `usePluginStore`.
  - The LLM plugin calls `setBusy(true/false)` around requests.
  - The floating FAB shows a **spinner** and sidebar buttons a **dot** while the
    plugin is generating, so a minimized chat keeps a visible "working"
    indicator.

## Bug 3 — App still freezes under SMB/network load

- Removed the **13 dead_code warnings**:
  - test-only `_impl` helpers (`attachment_add/get_base64/remove_impl`,
    `notes_import_impl`, storage `read_json/exists/list_dir/hash_file/
write_json_atomic/write_text_atomic/create_exclusive/remove_path_impl`) are
    now `#[cfg(test)]` (kept for the permission tests, absent from the shipped
    build);
  - `read_text_impl` was truly unused → deleted.
- Watcher audit: `watcher.rs` runs on its own `thread::spawn` (and `notify`
  runs its own thread); it never blocks the main event loop.
- Heavy `fsops` commands (storage reads/writes/list/hash, attachments,
  `notesImport`, plugins scan, offline-update check) are already `async fn` +
  `tokio::task::spawn_blocking`.

## How to test

1. Update the plugin in the workspace (`plugins/llm-assistant/index.html`).
2. Ollama: run `ollama serve`, pull a model, set provider **Local (Ollama)** in
   ⚙ (URL is `http://127.0.0.1:11434/v1/chat/completions`), load models, chat.
3. Start a long LLM reply, then **click outside the modal** — the chat minimizes
   to the floating button with a spinner, the request continues, and reopening
   shows the finished answer.
4. Transfer a large file over SMB while using the app — the UI stays responsive
   (all file/network commands are off-thread).

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **160 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/llm.rs           (no_proxy + detailed error logging)
src-tauri/src/commands/storage.rs       (cfg(test) _impl, removed read_text_impl)
src-tauri/src/commands/attachments.rs   (cfg(test) _impl)
src-tauri/src/commands/notes.rs         (cfg(test) notes_import_impl)
src/stores/usePluginStore.ts            (new: busy per plugin)
src/components/plugins/PluginFrame.tsx  (setBusy action)
src/pages/layout/WorkspaceLayout.tsx    (modal stays mounted; busy indicators)
src/pages/layout/WorkspaceLayout.module.css (hidden modal, spinner, dot)
plugins/llm-assistant/index.html        (setBusy around requests)
docs/reports/stage8-7-critical-fixes.md (this report)
```

## Known limitations / follow-ups

- `.no_proxy()` means corp-proxy users lose the proxy for OpenRouter; acceptable
  for a local desktop tool, revisit if remote-only deployments appear.
- Only one plugin frame stays mounted at a time; switching plugins unmounts the
  previous one (an in-flight request there is lost by design).
- Lock commands are still sync (tiny files); convert if SMB lock latency shows
  up in profiling.
