# Stage 10.9 — Fix Tab Routing, Settings & Graph Filters (v0.10.8)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/tabs-fix` (from `main`; `main` first merged
  `stage10/tabs-sort`)
- **Commit:** `stage10(9): fix tab routing, settings & graph filters`

## Part 1 — Tab architecture

- Removed the router-sync effect entirely: the URL is no longer observed, so
  Back/Forward cannot spawn tabs.
- `lib/navigate.ts`: `appNavigate` now owns the tab store:
  - note paths (`/app/kb/:id`) obey `openNotesInNewTab` → `openTab` or
    `replaceActiveTab`;
  - task deep links (`/app/tasks?...task=`) obey `openTasksInNewTab`;
  - every other page reuses an existing tab or opens one (`openTab`).
  It also keeps the URL in sync for deep links.
- `useTabStore`: added `replaceActiveTab`, `openNotesInNewTab` /
  `openTasksInNewTab` and `setTabSettings`.
- WorkspaceLayout initialises the active tab from the URL **once** on mount
  (F5/deep link) and loads the tab settings into the store. The sidebar links
  are now buttons that call `appNavigate` (active state derived from the active
  tab). The injected plugin sidebar button (the Graph/Wiki menu item) opens the
  plugin viewer tab via `appNavigate`.
- All in-app `navigate()` call sites (notes, tasks, notifications, command
  palette, plugin navigation) were routed through `appNavigate` so the tab
  store stays the source of truth. No browser back/forward controls exist in
  the UI (verified).

## Part 2 — Graph plugin

- `obsidian-graph/manifest.json` bumped to **1.0.2** so installed workspaces
  overwrite the old plugin.
- `index.html`: dark canvas with white 14px node labels, `interaction: { hover:
  true }`; filters now hide/show nodes via `nodesDataSet.update({ id, hidden })`
  instead of rebuilding the network (no flicker). The filter panel (search,
  category, tag) is present and wired.

## Part 3 — Graph in tabs

Clicking the Graph/Wiki sidebar plugin item now goes through `appNavigate`
(`/app/plugins/obsidian-graph`), so it opens/reuses a tab according to the
settings instead of React Router.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.8                     |

## Release

- Commit: `stage10(9): fix tab routing, settings & graph filters`
- Tag `v0.10.8` pushed to GitHub (triggers the release workflow).

## Notes

- During editing, three source files were accidentally re-encoded by a
  PowerShell text rewrite; they were restored from git and the changes were
  re-applied with the editor (UTF-8 verified).
- `openTasksInNewTab` only affects task deep links (`?task=`), since the tasks
  board is a single route and task details open in a panel.
