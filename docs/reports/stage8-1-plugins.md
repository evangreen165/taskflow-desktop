# Stage 8.1 — Plugin SDK & Backend

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(1): plugin SDK & backend`

## Goal

Foundation for loading third-party (AI/user-written) plugins without rebuilding
the app: drop a folder into the workspace, the app lists it, and it runs in an
isolated iframe.

## Backend (Rust)

### Model & storage — `src-tauri/src/plugins.rs`

Plugins live in `{workspace}/plugins/{plugin_id}/`:

```
{workspace}/plugins/{id}/
  manifest.json   { id, name, version, entry?, permissions[] }
  index.html      (default entry)
```

- `PluginManifest` is serde camelCase; `entry` defaults to `index.html`,
  `permissions` defaults to an empty list.
- Plugin ids are folder names (`[a-z0-9._-]`, ≤ 64 chars). Paths are resolved
  through `path::resolve_rel`, so `..` and absolute paths are rejected.
- `list(root)`: scans `plugins/`, skips non-directories, invalid ids, missing or
  malformed manifests, and folders whose `manifest.id` ≠ folder name; sorted by
  id.
- `read_content(root, id)`: reads the plugin's `manifest.json`, verifies the id,
  resolves `entry` **inside** the plugin folder, and returns the file text
  (`NOT_FOUND` if the entry is missing).

### Commands — `src-tauri/src/commands/plugins.rs`

| Command                      | Behaviour                                         |
| ---------------------------- | ------------------------------------------------- |
| `pluginsList`                | manifests of installed plugins (auth required)    |
| `pluginGetContent(pluginId)` | entry HTML for a sandboxed iframe (auth required) |

Registered in `lib.rs` and `commands/mod.rs`.

### Tests (4)

- valid plugins listed, garbage folders skipped;
- missing `plugins/` → empty;
- entry content read + traversal/unknown-id rejection;
- manifest/folder id mismatch rejected, missing entry → `NOT_FOUND`.

## Frontend

- `src/services/plugins.ts` — typed `PluginsService.list()` /
  `getContent(pluginId)` (+ service tests).
- Sidebar: **«🧩 Расширения»** link (visible to all users) in
  `WorkspaceLayout`.
- Routes in `App.tsx`:
  - `/app/plugins` → `PluginsPage`;
  - `/app/plugins/:pluginId` → `PluginViewerPage`.
- `PluginsPage.tsx`: cards (name, version, id, «Открыть»), skeleton cards while
  loading, and the empty-state message "Плагины не найдены. Поместите папку
  плагина в {workspace}/plugins/".
- `PluginViewerPage.tsx`: loads the entry via `pluginGetContent` and renders
  `<iframe sandbox="allow-scripts allow-same-origin" srcDoc={html} />`, fully
  isolated from the React app; a «← К плагинам» back button and an error state.

## SDK documentation — `docs/PLUGIN_SDK.md`

- folder layout and `manifest.json` schema (with field rules);
- self-contained `index.html` entries and sandboxing semantics;
- the planned `window.parent.postMessage` bridge
  (`taskflow:request` / `taskflow:response`) for reading tasks/notes later;
- install steps and security notes.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **158 passed**, 0 failed                              |
| `npm run test`  | **117 passed** (25 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/plugins.rs              (new: model/storage + tests)
src-tauri/src/commands/plugins.rs     (new: commands)
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
src/services/plugins.ts               (new)
src/services/plugins.test.ts          (new)
src/pages/plugins/PluginsPage.tsx     (new)
src/pages/plugins/PluginsPage.module.css (new)
src/pages/plugins/PluginViewerPage.tsx    (new)
src/pages/plugins/PluginViewerPage.module.css (new)
src/App.tsx                            (routes)
src/pages/layout/WorkspaceLayout.tsx   (sidebar link)
docs/PLUGIN_SDK.md                    (new)
docs/reports/stage8-1-plugins.md      (this report)
```

## Known limitations / follow-ups

- `manifest.permissions` is a declaration only; enforcement through the
  postMessage bridge is a later SDK stage.
- The `srcdoc` sandbox is a single document: plugins must be self-contained
  (external CSS/JS assets next to the entry do not load).
- `allow-same-origin` means plugin code shares the app origin — treated as
  trusted; a stricter per-plugin origin is a future hardening step.
