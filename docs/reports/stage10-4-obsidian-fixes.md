# Stage 10.4 — Obsidian UI Fixes & Custom Templates (v0.10.3)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/obsidian-fixes` (from `main`; `main` first merged
  `stage10/obsidian-ext`)
- **Commit:** `stage10(4): callouts dropdown, daily notes fixes & custom templates`

## Part 1 — Callouts dropdown

`MarkdownToolbar.tsx`: the 💡 button is now a dropdown with 🔵 Note,
🔴 Warning, 🟢 Tip, 🟣 Important. Selecting one inserts `> [!TYPE]\n> ` and
places the caret on the second line (right after `> `).

## Part 2 — Daily notes logic

`CalendarPage.tsx`:
- `notesForDate` now compares the note's **local** creation date
  (`new Date(note.createdAt)` formatted as `yyyy-MM-dd`) instead of slicing the
  UTC ISO string, or a case-insensitive match of the daily-format title.
- All matching notes are returned (multiple notes per day are allowed) and all
  are listed in the day panel's «Заметки этого дня».
- «📓 Дневник на этот день» resolves the exact daily-format title and opens it
  when present; otherwise it creates the note (category «Дневник») and opens it.

## Part 3 — Custom templates

- Backend: `WorkspaceConfig.customTemplates: HashMap<String, String>`
  (serde default), `workspaceGetTemplates` (auth) and `workspaceSaveTemplate`
  (auth, validates a non-empty name) → full map.
- Settings → Общие: «Шаблоны» section (name input + Markdown textarea + save)
  with a list of saved template names.
- `MarkdownToolbar`: «📋 Шаблоны» lists the hardcoded defaults and the custom
  templates (fetched from the backend whenever the menu opens), separated by a
  «Мои шаблоны» divider.
- Dropdown clipping fixed: `.toolbar { overflow: visible; }`, menus use
  `position: absolute; z-index: 100`.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.3                     |

## Release

- Commit: `stage10(4): callouts dropdown, daily notes fixes & custom templates`
- Tag `v0.10.3` pushed to GitHub (triggers the release workflow).

## Notes

- Custom templates are stored in the workspace `config.json` and are available
  to all users; saving requires an authenticated session.
- No unrelated code was refactored.
