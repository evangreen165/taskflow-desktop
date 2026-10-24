# Stage 8.16 — Plugin srcdoc Fix, Task Deletion & Checklist Editing (v0.8.6)

- **Status:** implemented, all gates green
- **Branch:** `hotfix/v0.8.6` (based on `hotfix/v0.8.5` which carries stage8(15);
  `main` had not merged stage8(15), and this work builds directly on its
  analytics fix, so branching from it avoids regressing the working widget)
- **Commit:** `stage8(16): iframe srcdoc fix, task deletion & checklist edit`

## Bug 1 — Plugin white screen (definitive fix)

The `plugin://` custom protocol is fundamentally unreliable inside a sandboxed
WebView2 iframe (scripts/styles are still blocked). The plugin iframe is back
to `srcdoc`:

1. `src/components/plugins/PluginFrame.tsx`:
   - loads the plugin entry HTML once via `PluginsService.getContent(pluginId)`;
   - renders
     `<iframe srcDoc={htmlContent} sandbox="allow-scripts allow-same-origin allow-forms" />`;
   - the postMessage bridge stays intact: `event.source === iframe.contentWindow`
     remains the authoritative check, and the accepted origins now also include
     the app's own origin (`window.location.origin`) because a `srcdoc` iframe
     with `allow-same-origin` inherits the parent origin — plus `null`/empty and
     the legacy `plugin://`/`plugin.localhost` forms;
   - shows «Загрузка плагина…» / error states while the HTML is read.
2. `src-tauri/tauri.conf.json` — CSP set permissively for iframes:
   ```
   default-src 'self' ipc: http://ipc.localhost http://plugin.localhost;
   connect-src *; img-src * data: blob:; style-src * 'unsafe-inline';
   script-src * 'unsafe-inline' 'unsafe-eval'; frame-src 'self' data: blob:;
   ```
   Inline plugin scripts/styles are allowed via `'unsafe-inline'`, and the
   `srcdoc` iframe is not a network frame URL (`frame-src 'self' data: blob:`).
   The bundled `llm-assistant` plugin is a single self-contained `index.html`,
   so `srcdoc` needs no external asset resolution.

## Bug 2 — Analytics animation

`src/components/dashboard/AnalyticsWidget.tsx`: `isAnimationActive={true}` is
now explicit on both `<Pie>` and `<Bar>`.

## Feature 1 — Task deletion

`src/components/tasks/TaskDetailPanel.tsx`:
- «Удалить задачу» button in the panel header, rendered only when the session
  has `task.delete`;
- confirmation dialog (reuses `.modalBackdrop`/`.conflictCard`/`.actions`);
- on confirm: flush pending debounced edits, call
  `TasksService.delete(spaceId, taskId)`, close the panel and refresh the task
  list via the existing `onClose` (TasksPage refetches the store board,
  DashboardPage reloads the summary); success/error toasts included.
- New styles: `.dangerBtn` (header outline-danger), `.dangerSolid` (red confirm).

## Feature 2 — Editable checklist items

- `src/hooks/useTaskEditor.ts`: new `updateChecklistItem(id, text)` which
  patches the checklist draft and saves immediately (the existing
  `applyDraft(…, true)` → `buildUpdatePatch` → `tasksUpdate` path).
- `src/components/tasks/TaskDetailPanel.tsx`: each row's text is now a local
  `ChecklistItemInput` — an inline `<input>` that commits on blur or Enter
  (Escape reverts), with the existing ✕ button to remove the item. The input
  is styled with `.checklistInput` and dims via `.strike` when done.

## Files touched

```
src/components/plugins/PluginFrame.tsx           (srcdoc iframe, content load, bridge origin)
src-tauri/tauri.conf.json                        (permissive iframe CSP, version 0.8.6)
src/components/dashboard/AnalyticsWidget.tsx     (isAnimationActive)
src/components/tasks/TaskDetailPanel.tsx         (delete button+modal, checklist edit input)
src/components/tasks/TaskDetailPanel.module.css  (dangerBtn/dangerSolid/checklistInput)
src/hooks/useTaskEditor.ts                       (updateChecklistItem)
package.json / package-lock.json                 (0.8.6)
CHANGELOG.md                                     ([0.8.6])
docs/reports/stage8-16-plugin-tasks-fix.md       (this report)
```

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **164 passed**, 0 failed               |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.8.6                      |

## Notes / follow-ups

- The `plugin://` custom protocol handler (`plugin_protocol.rs`) is kept for
  backward compatibility but is no longer used by the UI.
- The CSP now uses `*` for scripts/styles/connections; on macOS/Linux the app
  page is served from `tauri://localhost`, which `*` does not cover — on those
  platforms `'self'` may need to be added to `script-src`/`style-src` if the
  app's own bundle is blocked (Windows serves from `http://tauri.localhost`,
  covered by `*`).
- No other bugs were touched in this hotfix.
