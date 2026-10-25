# Stage 10.3 — Obsidian Extensions: Callouts, Tags, Templates & Calendar Notes (v0.10.2)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/obsidian-ext` (from `main`; `main` first merged
  `stage10/learning-pdf`)
- **Commit:** `stage10(3): callouts, tags, templates & calendar notes`

## Part 1 — Daily notes gating & calendar UI

- `CalendarPage.tsx`: `obsidianEnabled = extensionsEnabled && pluginStates["obsidian-graph"] === true`.
- When enabled, all notes for the current space are fetched (`NotesService.list`).
- Day cells show a small 📝 marker when a note was created on that date or a
  daily note matching the configured format exists (`notesForDate`).
- The day panel has a «Заметки этого дня» section listing those notes (click to
  open `/app/kb/{id}`).
- The «📓 Дневник на этот день» button is now rendered only when the plugin is
  enabled; `formatDailyTitle` maps `YYYY/YY/DD/D` to date-fns tokens.

## Part 2 — Callouts

- `KbArticlePage.tsx`: `preprocessCallouts` converts
  `> [!NOTE|WARNING|TIP|IMPORTANT]` blockquotes into raw HTML
  `<div class="callout callout-*">` blocks (title + escaped body), rendered by
  `rehype-raw` in both read and preview modes.
- Global callout styles (`.callout-note/-warning/-tip/-important` with icons
  🔵/🔴/🟢/🟣) added to `KbArticlePage.module.css` via `:global(...)`.
- `MarkdownToolbar`: 💡 button inserts `> [!NOTE]\n> Текст`.

## Part 3 — Hierarchical tags

- Tags already accepted `/` (no backend restriction).
- `KbPage.tsx`: a «Теги» sidebar section groups slash-separated tags
  (`работа/проект` under `работа`). Clicking a group filters notes whose tags
  match the group or its children (`работа/*`); «Сбросить» clears it.

## Part 4 — Templates

- `MarkdownToolbar`: «📋 Шаблоны» dropdown with «Встреча», «База знаний» and
  «Дневник» templates inserted at the cursor (with the current date).

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.2                     |

## Release

- Commit: `stage10(3): callouts, tags, templates & calendar notes`
- Tag `v0.10.2` pushed to GitHub (triggers the release workflow).

## Notes

- Callout bodies are rendered as escaped plain text (raw HTML blocks are not
  Markdown-parsed), so wiki-links/markdown inside a callout body are not
  linkified — outside callouts everything works as before.
- The templates dropdown closes after inserting a template (toggle to reopen).
- No unrelated code was refactored.
