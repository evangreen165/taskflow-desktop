# Stage 10.5 — Daily Notes Fix, Templates Portal & Plugin Rebrand (v0.10.4)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/fix-ui` (from `main`; `main` first merged
  `stage10/obsidian-fixes`)
- **Commit:** `stage10(5): fix daily notes, templates portal & rebrand plugin`

## Part 1 — Daily notes logic

`CalendarPage.tsx`:
- `notesForDate` now matches **only** by the note's local creation date
  (`new Date(note.createdAt)` formatted `yyyy-MM-dd`), with no title matching
  and no limit. Multiple notes per day all appear in «Заметки этого дня», and
  renaming a note no longer removes it from its day.
- The daily-note button still resolves the exact daily-format title (open or
  create) — that is a separate action.
- The backend `notesList`/`notes::list_meta` returns the full list (no
  truncation), so the frontend receives every note.

## Part 2 — Templates dropdown via portal

`MarkdownToolbar.tsx`: the templates menu is now rendered with
`createPortal(..., document.body)` and positioned from the button's
`getBoundingClientRect()` (`position: fixed`, `top`/`left`), so it is never
clipped by the editor/toolbar `overflow`.

## Part 3 — Templates management modal

- Backend: `workspaceDeleteTemplate(name)` + `workspace::delete_template`.
- `SettingsPage` → Общие: the inline form was replaced by an
  «Управление шаблонами» button that opens a modal listing all custom
  templates (with «Удалить») and a create form (name + large Markdown textarea).

## Part 4 — Plugin rebrand

- `obsidian-graph/manifest.json`: name → **«Wiki & Graph (База знаний)»**,
  version `1.0.1` (so installed workspaces update).
- Plugin `index.html`: `<title>`/header → «🕸️ Wiki & Graph».
- Sidebar: the injected plugin button shows 🕸️ for `obsidian-graph` (🧩 for
  others).

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.4                     |

## Release

- Commit: `stage10(5): fix daily notes, templates portal & rebrand plugin`
- Tag `v0.10.4` pushed to GitHub (triggers the release workflow).

## Notes

- The plugin id stays `obsidian-graph` (only the display name/icon changed), so
  existing plugin state and wiki/backlink gating are unaffected.
- No unrelated code was refactored.
