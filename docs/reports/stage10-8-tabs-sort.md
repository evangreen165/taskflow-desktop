# Stage 10.8 — Graph Filters, Tab System & Kanban Column Reordering (v0.10.7)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/tabs-sort` (from `main`; `main` first merged
  `stage10/obsidian-features`)
- **Commit:** `stage10(8): graph filters, tab system & kanban column reorder`

## Part 1 — Graph filters

`obsidian-graph/index.html`: added a filter panel overlay with a text search,
a category dropdown and a tag dropdown. Filtering rebuilds the visible
`vis.DataSet`s via `clear()` + `add()` on every change; edges are kept only
when both endpoints are visible. Categories/tags are populated from the notes.

## Part 2 — Core tab system

- `src/stores/useTabStore.ts`: `tabs`, `activeTabId`, `openTab(title, path,
  reuse?)` (dedupe by path or replace the active tab), `closeTab(id)`,
  `setActiveTab(id)`.
- `src/components/layout/TabsBar.tsx` (+ CSS): horizontal tab strip with close
  buttons; clicking a tab activates it and syncs the URL.
- `WorkspaceLayout.tsx`: renders `<TabsBar />` below the topbar and the active
  tab's page via `renderTabContent(path)` instead of `<Outlet />`. A router
  sync effect opens/activates a tab on every navigation (and redirects `/app`
  to `/app/dashboard`). `KbArticlePage`/`PluginViewerPage` accept an optional
  `noteId`/`pluginId` prop so they render outside the router's param context.

## Part 3 — Tab settings

- Backend: `openNotesInNewTab` (default true) / `openTasksInNewTab` (default
  false) in `config.json`, `workspaceGetTabSettings` / `workspaceSetTabSettings`.
- Settings → Общие: «Вкладки» checkboxes (admin).
- The router-sync effect uses them: when the setting is off, navigating to a
  note/task reuses the current tab instead of opening a new one.

## Part 4 — Kanban column reordering

- Backend: `kanbanColumnOrder` (default the six statuses) with
  `workspaceGetKanbanOrder` / `workspaceSetKanbanOrder`.
- `KanbanBoard.tsx`: one `DndContext` with a horizontal `SortableContext`;
  columns use `useSortable` (header is the drag handle, the column remains a
  task drop target) and cards use `useDraggable` with `data.type = "task"`.
  Dropping a column reorders the local state and persists the new order;
  columns render in the persisted order.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.7                     |

## Release

- Commit: `stage10(8): graph filters, tab system & kanban column reorder`
- Tag `v0.10.7` pushed to GitHub (triggers the release workflow).

## Notes

- The release version is `0.10.7` as requested (no `0.10.6` tag was created).
- Existing navigation calls automatically participate in the tab system via the
  router-sync effect, so no per-call changes were needed beyond the settings.
- No unrelated code was refactored.
