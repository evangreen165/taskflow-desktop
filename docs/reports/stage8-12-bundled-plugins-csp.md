# Stage 8.12 — Bundle Default Plugins & Fix CSP (v0.8.2)

- **Status:** implemented, production build verified
- **Branch:** `hotfix/v0.8.2` → merged into `main`
- **Commit:** `stage8(12): bundle default plugins & fix CSP`

## Task 1 — Bundle the default plugin

The app loads plugins from `{workspace}/plugins/`, which the updater never
touched — users kept the old broken files.

- `plugins/llm-assistant/` moved to
  `src-tauri/resources/plugins/llm-assistant/`.
- `tauri.conf.json` → `bundle.resources`:
  ```json
  "resources": { "resources/plugins/llm-assistant": "plugins/llm-assistant" }
  ```
  Verified in the release build: files land at
  `target/release/plugins/llm-assistant/` (i.e. `{resource_dir}/plugins/...`).
- New `plugins::install_default_plugins` runs on **`initWorkspace` and
  `activateWorkspace`**:
  - reads the bundled manifest version and the installed
    `{workspace}/plugins/llm-assistant/manifest.json` version;
  - if the workspace copy is missing **or** the bundled version is newer
    (semver `major.minor.patch`), recursively copies/overwrites the files;
  - otherwise leaves the workspace copy untouched.
- Resource lookup tries `{resource_dir}/plugins`, `{resource_dir}/resources/plugins`,
  `CARGO_MANIFEST_DIR/resources/plugins` (dev) and `resources/plugins`.
- Tests: missing → installed, older → overwritten, newer → untouched, version
  comparison.

## Task 2 — Iframe CSP + Blob URL

- CSP updated to the permissive set (inline plugin scripts/styles, `data:`/
  `blob:` images, `frame-src`):
  ```
  default-src 'self' ipc: http://ipc.localhost;
  connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:11434 http://localhost:11434 https://openrouter.ai https://api.openai.com;
  img-src 'self' asset: http://asset.localhost data: blob:;
  style-src 'self' 'unsafe-inline';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  frame-src 'self' data:
  ```
- `PluginFrame` now renders the plugin from a **Blob URL** instead of
  `srcDoc`:
  ```ts
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);   // revoked on change/unmount
  <iframe src={url} sandbox="allow-scripts allow-same-origin" />
  ```
  Blob documents are better supported under the app CSP while still inheriting
  the app origin for the `postMessage` bridge and `localStorage`.

## Task 3 — Plugin buttons

The plugin uses `addEventListener` (no inline `onclick`); the only blocker was
the inline `<script>` being denied by CSP — fixed by `script-src
'unsafe-inline'`. Bridge timeouts and `console.error` diagnostics (from 8.11)
remain in place.

## Task 4 — Verification & release

- `npm run tauri build` succeeded locally (0.8.2):
  - `TaskFlow_0.8.2_x64_en-US.msi` (6.72 MiB) + `.sig`
  - `TaskFlow_0.8.2_x64-setup.exe` (4.43 MiB) + `.sig`
  - plugin resources present at `target/release/plugins/llm-assistant/`.
- Version **0.8.2** (`package.json`, `tauri.conf.json`, `package-lock.json`);
  `version:check` → OK.
- CHANGELOG `[0.8.2]` section; commit, merge into `main`, tag `v0.8.2`, push.

> After the update, the workspace copy is refreshed on the **next workspace
> activation** (app start / switching the workspace folder), because the
> installer cannot write into the SMB workspace.

## Gates

| Gate                  | Result                                                     |
| --------------------- | ---------------------------------------------------------- |
| `cargo test`          | **162 passed**, 0 failed                                   |
| `npm run test`        | **119 passed** (26 files)                                  |
| `npm run lint`        | clean (`--max-warnings 0`)                                 |
| `npm run build`       | success                                                    |
| `npm run tauri build` | success (MSI + NSIS + updater signatures + bundled plugin) |

## Files touched

```
src-tauri/resources/plugins/llm-assistant/   (moved from plugins/)
src-tauri/src/plugins.rs                     (install_default_plugins + tests)
src-tauri/src/commands/workspace.rs          (run install on init/activate)
src-tauri/tauri.conf.json                    (resources + CSP + version)
src/components/plugins/PluginFrame.tsx       (Blob URL iframe)
docs/PLUGIN_SDK.md                           (bundled-plugin note)
package.json / package-lock.json             (0.8.2)
CHANGELOG.md                                 (0.8.2)
docs/reports/stage8-12-bundled-plugins-csp.md (this report)
```

## Known limitations / follow-ups

- The workspace plugin is refreshed on activation, not at install time; a user
  who never reopens the workspace keeps the old copy.
- `'unsafe-inline'`/`'unsafe-eval'` are required for the sandboxed plugin model;
  the iframe still has no filesystem/IPC access.
