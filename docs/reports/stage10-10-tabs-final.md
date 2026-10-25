# Stage 10.10 — Final Tab System Fixes (v0.10.9)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/tabs-final` (from `main`; `main` first merged
  `stage10/tabs-fix`)
- **Commit:** `stage10(10): fix plugin tab names & tab settings logic`

## Bug 1 — Plugin tab named «Расширения»

- `lib/navigate.ts`: `AppNavigateOptions` gained `title?: string`; `appNavigate`
  uses `options.title` when provided, otherwise derives it from the path.
- `useTabStore.openTab`: when a tab for the path already exists it now updates
  that tab's title as well (so a previously generic title is corrected).
- `WorkspaceLayout` sidebar plugin item and `PluginsPage` «Открыть» pass the
  plugin's display name (`plugin.name`) as the title, so the tab shows
  e.g. «Wiki & Graph (База знаний)».

## Bug 2 — Tab settings ignored

- `SettingsPage.saveTabSettings` now calls
  `useTabStore.getState().setTabSettings(...)` immediately (before and after the
  backend save), so unchecking «Открывать заметки в новой вкладке» takes effect
  right away instead of only after the next layout mount.
- `appNavigate` explicitly reads `useTabStore.getState().openNotesInNewTab`:
  `true` → `openTab`, `false` → `replaceActiveTab` (already in place, verified).
- Removed the remaining `useNavigate` usages from `LoginScreen`,
  `Onboarding`, `ChangeFolderModal` and `TabsBar`; all now go through
  `appNavigate`. Only `main.tsx` (router registration) and the
  `WorkspaceLayout` mount-time URL read use the router directly.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.9                     |

## Release

- Commit: `stage10(10): fix plugin tab names & tab settings logic`
- Tag `v0.10.9` pushed to GitHub (triggers the release workflow).

## Notes

- `TabsBar` activation/close passes the tab's own title to `appNavigate`, so
  activating a tab never overwrites a custom (plugin) title.
- No unrelated code was refactored.
