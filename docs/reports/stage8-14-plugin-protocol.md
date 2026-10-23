# Stage 8.14 — Native Plugin Protocol & Watcher Removal (v0.8.4)

- **Status:** implemented, production build verified
- **Branch:** `hotfix/v0.8.4` → merged into `main`
- **Commit:** `stage8(14): custom protocol for plugins & remove SMB watcher`

## Task 1 — Native `plugin://` protocol (white-screen fix)

- New `src-tauri/src/plugin_protocol.rs`:
  - resolves `plugin://<id>/<path>` **and** the WebView2 form
    `http://plugin.localhost/<id>/<path>`;
  - serves files from `{workspace}/plugins/<id>/<path>` with the correct MIME
    type (html/css/js/json/svg/png/…);
  - validates the plugin id and relative path with `path::resolve_rel`
    (no `..`, no absolute paths) and returns 404 on failure;
  - reads small assets synchronously (the iframe needs a fast response).
- Registered in `lib.rs`:
  ```rust
  .register_uri_scheme_protocol("plugin", |ctx, request| {
      let state = ctx.app_handle().state::<AppState>();
      plugin_protocol::handle(&state, &request)
  })
  ```
- CSP now allows `plugin:` in `default-src`, `connect-src`, `img-src`,
  `style-src`, `script-src` and `frame-src`.
- `PluginFrame` renders:
  ```tsx
  <iframe src={`plugin://${pluginId}/index.html`} sandbox="allow-scripts allow-same-origin" />
  ```
  No more `srcDoc` or Blob URL. The iframe gets a real origin, so inline
  scripts/styles and `localStorage` work in release builds.

## Task 2 — SMB freezes (notify removed)

- Removed the `notify` dependency and deleted `watcher.rs`.
- `AppState` no longer stores a watcher; `ensure_watcher` and the
  `notify::Error` conversion were removed.
- The `watch` command is kept as a **no-op** for frontend API compatibility;
  updates rely strictly on the existing 30 s polling (task, dashboard,
  notifications), which already skips ticks while a request is in flight.
- Dead-code cleanup: the now test-only `*_impl` helpers
  (`tasks_list/get`, `notes_list/get/categories`, `dashboard_summary`,
  `notifications_list`, `spaces_list/get/members`, `init/activate_workspace`)
  are behind `#[cfg(test)]`; `rel_path_between` is test-only.
  `cargo build --lib` → **0 warnings**.

## Task 3 — Bridge origin

`PluginFrame` still validates `event.source === iframe.contentWindow` (the
authoritative check) and additionally accepts only plugin origins
(`plugin://…`, `http://plugin.localhost`, `https://plugin.localhost`, or a
null/empty origin fallback).

## Task 4 — Release

- Version **0.8.4** (`package.json`, `tauri.conf.json`, `package-lock.json`);
  `npm run version:check` → OK.
- CHANGELOG `[0.8.4]`.
- Local `npm run tauri build` succeeded:
  - `TaskFlow_0.8.4_x64_en-US.msi` (6.82 MiB) + `.sig`
  - `TaskFlow_0.8.4_x64-setup.exe` (4.50 MiB) + `.sig`
  - bundled plugin present at `target/release/plugins/llm-assistant/`.
- Commit, merge into `main`, tag `v0.8.4`, push.

## Gates

| Gate                  | Result                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `cargo test`          | **160 passed**, 0 failed (2 watcher tests removed with the module) |
| `npm run test`        | **119 passed** (26 files)                                          |
| `npm run lint`        | clean (`--max-warnings 0`)                                         |
| `npm run build`       | success                                                            |
| `npm run tauri build` | success (MSI + NSIS + updater signatures + bundled plugin)         |
| `cargo build --lib`   | **0 warnings**                                                     |

## Files touched

```
src-tauri/src/plugin_protocol.rs          (new: plugin:// handler)
src-tauri/src/lib.rs                      (protocol registration, watcher state removed)
src-tauri/src/commands/storage.rs         (watch → no-op)
src-tauri/src/error.rs                    (removed notify::Error conversion)
src-tauri/src/watcher.rs                  (deleted)
src-tauri/Cargo.toml / Cargo.lock         (notify removed)
src-tauri/src/commands/{tasks,notes,dashboard,notifications,spaces,workspace}.rs
                                          (test-only _impl behind cfg(test))
src-tauri/src/path.rs                     (rel_path_between test-only)
src-tauri/tauri.conf.json                 (CSP plugin:, version)
src/components/plugins/PluginFrame.tsx    (custom-protocol iframe, origin check)
package.json / package-lock.json          (0.8.4)
CHANGELOG.md                              (0.8.4)
docs/reports/stage8-14-plugin-protocol.md (this report)
```

## Known limitations / follow-ups

- The iframe always loads `index.html`; plugins with a custom `entry` would need
  the manifest passed to the frame.
- Write commands still perform small file writes on the command thread; they are
  user-initiated, not polled.
- Without the watcher, cross-PC changes appear within ~30 s instead of instantly.
