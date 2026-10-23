# Stage 8.11 — Release CSP & Performance Hotfix (v0.8.1)

- **Status:** implemented, production build verified
- **Branch:** `hotfix/v0.8.1` → merged into `main`
- **Commit:** `stage8(11): fix release CSP and performance bottlenecks`

## Task 1 — CSP for plugins (production)

The old CSP had no `script-src`, so `default-src 'self'` blocked the plugin
iframe's inline `<script>` — buttons dead, theme not applied in the compiled
app (dev mode has no such restriction).

New `src-tauri/tauri.conf.json` → `app.security.csp`:

```
default-src 'self' ipc: http://ipc.localhost;
connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:11434 http://localhost:11434 https://openrouter.ai https://api.openai.com;
img-src 'self' asset: http://asset.localhost blob: data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval' asset: http://asset.localhost;
frame-src 'self' data:
```

This allows the `srcdoc` plugin to run inline scripts/styles and to be framed,
while keeping the rest of the app sandboxed.

## Task 2 — Release-build freezes

- **Watcher debounce**: `DEBOUNCE` raised from **150 ms → 700 ms**. SMB saves
  emit bursts of events; the frontend now gets one batch per burst instead of
  dozens. (`notify` + the debounce loop already run on dedicated threads.)
- **Polling overlap**: the 30 s polls are guarded (from 8.8):
  - `useTaskStore.fetchTasksSilently` — `silentFetchInFlight`;
  - `useNotificationStore.fetch` — `notificationFetchInFlight`;
  - `DashboardPage` — `summaryFetchRef` / `spaceTasksFetchRef`.
    A slow SMB response can no longer stack a second request.
- GPU flags (`--disable-gpu`) were **not** added: the async/polling fixes are
  preferred; the flag remains a documented last resort.

## Task 3 — Plugin buttons in production

- The plugin uses `addEventListener` (no inline `onclick`), so the only blocker
  was the CSP blocking its inline `<script>` — fixed by `script-src
'unsafe-inline'`.
- Theme: the plugin still requests `getTheme` over the bridge and toggles the
  `.dark` class on `<body>`.
- Added diagnostics: `callPlugin` now has a timeout (30 s, 330 s for `llmChat`)
  and logs `console.error` on timeout; request failures are logged too.

## Task 4 — Verification & release

- `npm run tauri build` succeeded locally with the passwordless signing key:
  - `TaskFlow_0.8.0_x64_en-US.msi` (6.70 MiB) + `.sig`
  - `TaskFlow_0.8.0_x64-setup.exe` (4.41 MiB) + `.sig`
- Version bumped to **0.8.1** (`package.json`, `tauri.conf.json`,
  `package-lock.json`); `npm run version:check` → OK.
- CHANGELOG got a `[0.8.1]` section.
- Commit, merge into `main`, tag `v0.8.1`, push (triggers GitHub Actions).

## Gates

| Gate                  | Result                                    |
| --------------------- | ----------------------------------------- |
| `cargo test`          | **160 passed**, 0 failed                  |
| `npm run test`        | **119 passed** (26 files)                 |
| `npm run lint`        | clean (`--max-warnings 0`)                |
| `npm run build`       | success                                   |
| `npm run tauri build` | success (MSI + NSIS + updater signatures) |

## Files touched

```
src-tauri/tauri.conf.json              (CSP + version)
src-tauri/src/watcher.rs               (700 ms debounce)
plugins/llm-assistant/index.html       (bridge timeout + console diagnostics)
package.json / package-lock.json       (0.8.1)
CHANGELOG.md                           (0.8.1)
docs/reports/stage8-11-csp-hotfix.md   (this report)
```

## Known limitations / follow-ups

- `'unsafe-inline'`/`'unsafe-eval'` in `script-src` are required for the
  sandboxed plugin model; the iframe still has no filesystem/IPC access.
- If freezes persist on a specific GPU/driver, `additionalBrowserArgs:
"--disable-gpu"` is the documented fallback.
