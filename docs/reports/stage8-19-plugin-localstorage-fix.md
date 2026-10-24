# Stage 8.19 — Fix Plugin localStorage Crash (v0.9.0)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `hotfix/v0.9.0`
- **Commit:** `stage8(19): fix plugin localStorage crash`

## Root cause

In WebView2 production, `localStorage` access inside the plugin iframe
(`srcDoc`/`blob:`) throws a `SecurityError`. The error halted the plugin's
entire `<script>` **before** the `addEventListener` calls ran, so every button
was dead even though the UI rendered.

## Task 1 — Safe storage wrappers (`src-tauri/resources/plugins/llm-assistant/index.html`)

- Added `safeGetStorage(key)` / `safeSetStorage(key, value)` wrappers that
  swallow the `SecurityError` (get → `null`, set → `console.warn`).
- Replaced all four direct `localStorage` uses:
  - settings init (`getItem("taskflow_llm_settings")`),
  - chat history init (`getItem("taskflow_llm_chats")`),
  - `saveChats()` (`setItem("taskflow_llm_chats", …)`),
  - `saveSettings()` (`setItem("taskflow_llm_settings", …)`).
- The script now always runs to completion and attaches its click handlers;
  settings/history simply degrade to in-memory when storage is blocked.
- Bundled plugin manifest bumped to **1.1.0** so the plugin reinstaller copies
  the fixed HTML into existing workspaces.

## Task 2 — Error listener (diagnostics)

- At the top of the plugin `<script>`: `window.onerror` posts
  `{ type: "plugin:error", message, stack }` to the parent.
- In `src/components/plugins/PluginFrame.tsx` the bridge listens for
  `type === "plugin:error"` (gated by the same `event.source` check) and
  shows an error toast plus `console.error` with the stack.

## Task 3 — iframe back on Blob URL + sandbox (`PluginFrame.tsx`)

- The plugin HTML is served through `URL.createObjectURL(new Blob([…], { type:
  "text/html" }))` (revoked on content change); `srcDoc` was dropped.
- Sandbox restored: `sandbox="allow-scripts allow-same-origin allow-forms"`.
- Bridge keeps `event.source === iframe.contentWindow` as its only gate.
- CSP stays disabled (`"csp": null`) from the previous stage.

## Files touched

```
src-tauri/resources/plugins/llm-assistant/index.html   (safe storage + window.onerror)
src-tauri/resources/plugins/llm-assistant/manifest.json (1.1.0)
src/components/plugins/PluginFrame.tsx                  (blob URL iframe + sandbox, plugin:error)
package.json / package-lock.json / src-tauri/tauri.conf.json  (0.9.0)
CHANGELOG.md                                            ([0.9.0])
docs/reports/stage8-19-plugin-localstorage-fix.md       (this report)
```

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **164 passed**, 0 failed               |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.0                      |

## Release

- Commit: `stage8(19): fix plugin localStorage crash`
- Tag: `v0.9.0` pushed to `origin` (triggers the release workflow).

## Notes / follow-ups

- If `localStorage` is blocked, chat history/settings do not persist across
  reloads — acceptable by design until plugin storage is moved to the host.
- No other bugs were touched in this stage.
