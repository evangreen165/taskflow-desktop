# Stage 8.3 — Plugin UI Injection & LLM Assistant

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(3): plugin UI injection & LLM assistant`

## Task 1 — UI injection

### Manifest

`PluginManifest` gained an optional `ui` object:

```json
"ui": { "inject": "sidebar" | "topbar" | "floating" }
```

Backend parses `ui.inject` and exposes it in `pluginsList`; the frontend type
mirrors it (`ui: { inject: string } | null`).

### WorkspaceLayout rendering

`WorkspaceLayout` loads `PluginsService.list()` once and renders:

- **sidebar**: a «Плагины» section with a 🧩 button per plugin (`inject:
"sidebar"`);
- **topbar**: a 🧩 ghost button per plugin (`inject: "topbar"`);
- **floating**: a fixed bottom-right FAB per plugin (`inject: "floating"`).

Clicking any button opens a **modal overlay** with the plugin's name in the
header, a close button, and the plugin rendered in the sandboxed iframe — so the
user keeps context (important for a chat experience).

### Reusable `PluginFrame`

The iframe + `postMessage` bridge was extracted from `PluginViewerPage` into
`src/components/plugins/PluginFrame.tsx`. Both the viewer page and the injected
modal use it, so the bridge lives in exactly one place. `PluginViewerPage` is
now a thin shell (back button + `PluginFrame`).

## Task 2 — Bridge: LLM proxy (CORS bypass)

- New bridge action **`llmChat`**:
  `payload { url, apiKey?, body }` → `LlmService.proxy(url, apiKey, body)`.
- New Rust command **`llmProxyRequest(url, api_key, body)`** in
  `commands/llm.rs`: builds a `reqwest` client (120 s timeout), forwards `body`
  to the provider with `Content-Type: application/json` and
  `Authorization: Bearer <apiKey>` (when set), and returns the raw provider JSON
  text. Only `http://`/`https://` URLs are accepted (`INVALID_INPUT`
  otherwise); non-2xx responses return `LLM_ERROR` with the provider body.
- `reqwest` added to `Cargo.toml` (`rustls-tls`, no default TLS).
- Unit test: URL scheme validation.

## Task 3 — LLM Assistant plugin

`plugins/llm-assistant/` (a distributable plugin folder):

```
plugins/llm-assistant/
  manifest.json   { id: llm-assistant, name: AI Ассистент, version: 1.0.0, ui: { inject: floating } }
  index.html      (self-contained chat UI, inline CSS/JS)
```

The plugin:

- shows a chat UI and a settings modal (API URL — defaults to OpenRouter, API
  Key, model — stored in `localStorage`);
- sends requests via the bridge `llmChat`;
- uses a system prompt that instructs the model to reply with only
  `{"action":"create_notes","notes":[...]}` when the user asks to create notes;
- parses the reply (```json fences or a bare JSON substring), and for
  `create_notes` calls `createNote` for each note, shows the count in chat and a
  toast «Создано N заметки» via `showToast`;
- otherwise shows the model's text as an assistant message.

## SDK — `docs/PLUGIN_SDK.md`

Documented the `llmChat` action (table row + a "LLM proxy" section with an
OpenRouter example).

## How to test

1. **Copy the plugin into a workspace** (the repo folder is the distributable
   source):
   ```
   copy plugins/llm-assistant {workspace}/plugins/llm-assistant
   ```
   (or create `{workspace}/plugins/llm-assistant/` and drop `manifest.json` +
   `index.html` into it).
2. **Open the app** → a 🧩 floating button appears in the bottom-right corner
   (and the plugin appears under **Расширения**).
3. **Click the floating button** → the plugin opens in a modal.
4. In ⚙ **Настройки**: keep the default OpenRouter URL, paste your OpenRouter
   API key, optionally pick a model (e.g. `openai/gpt-4o-mini`), save.
5. Ask in chat, for example: _«Создай три заметки про TaskFlow: архитектура,
   плагины, безопасность»_.
6. The plugin creates the notes via the bridge; the app shows the toast
   «Создано 3 заметки» and the notes appear under **Заметки** in the current
   space.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **159 passed**, 0 failed                              |
| `npm run test`  | **118 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/plugins.rs                 (ui field + test)
src-tauri/Cargo.toml                     (reqwest)
src-tauri/src/commands/llm.rs            (new: llmProxyRequest + test)
src-tauri/src/commands/mod.rs, src-tauri/src/lib.rs (registration)
src/services/plugins.ts                  (ui type)
src/services/llm.ts, llm.test.ts         (new)
src/components/plugins/PluginFrame.tsx, .module.css (new: bridge extracted)
src/pages/plugins/PluginViewerPage.tsx   (thin shell)
src/pages/layout/WorkspaceLayout.tsx, .module.css (injection + modal)
plugins/llm-assistant/manifest.json, index.html (new plugin)
docs/PLUGIN_SDK.md                       (llmChat)
docs/reports/stage8-3-llm-plugin.md      (this report)
```

## Known limitations / follow-ups

- The LLM proxy accepts any `http(s)` URL (SSRF risk); plugin code is treated
  as trusted. A future stage can restrict to allow-listed providers or add
  per-plugin network permissions.
- `createNote` currently ignores `tags` (the backend create payload has no
  tags); the SDK documents title/category/content only.
- UI injection lists plugins once on layout mount; a changed `plugins/` folder
  requires a page reload (the Расширения page still refreshes on navigation).
- The plugin's API key is stored in the plugin's `localStorage` (inside the
  sandboxed iframe), not in TaskFlow's stores.
