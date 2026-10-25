# Stage 10.11 — Decouple Tabs from Router History (v0.10.10)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/tabs-core-fix` (from `main`; `main` first merged
  `stage10/tabs-final`)
- **Commit:** `stage10(11): decouple tabs from router history`

## Task 1 — Tabs are the only source of truth

- `lib/navigate.ts` `appNavigate`: for `/app/*` paths it **no longer calls
  React Router**. It updates the tab store and the URL with
  `window.history.replaceState(null, "", "<path>#<path>")` (so F5 works) —
  which creates no history entries — and emits a synthetic `popstate` only so
  the top-level router notices a login → workspace transition. Non-app paths
  (`/login`, `/onboarding`) still use the router (needed to cross the top-level
  gate).
- `WorkspaceLayout`: removed `useLocation` and the location-driven effect; the
  main area renders `renderTabContent(activeTab.path)` (no `Routes`/`Outlet`).
  The active tab is initialised once from `window.location.hash`.
- The «← К заметкам» buttons in `KbArticlePage` now `appNavigate("/app/kb",
  { replace: true })` (replace the current tab) instead of relying on browser
  history; there are no `history.back()` calls in the UI.

## Task 2 — Settings honoured

- `SettingsPage`: toggling «Вкладки» immediately calls
  `useTabStore.setState({ openNotesInNewTab, openTasksInNewTab })` (before and
  after the backend save).
- `KbPage`: the note grid explicitly reads
  `useTabStore.getState().openNotesInNewTab` and calls
  `appNavigate(path, { title: "Заметка", replace: !openInNew })`.
- `appNavigate` now honours a unified `replace` flag: `replace: true` →
  `replaceActiveTab`, otherwise the note path also falls back to
  `replaceActiveTab` when `openNotesInNewTab` is false.

## Task 3 — Cleanup

- No `useNavigate` / `navigate()` remains outside `main.tsx` (router
  registration). `TabsBar` is the way to switch between open screens; sidebar
  links open/activate tabs.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.10                    |

## Release

- Commit: `stage10(11): decouple tabs from router history`
- Tag `v0.10.10` pushed to GitHub (triggers the release workflow).

## Notes

- Non-app transitions (login, onboarding, change-folder) still use the router
  because the top-level gate is router-based; only the workspace main area is
  tab-driven.
- No unrelated code was refactored.
