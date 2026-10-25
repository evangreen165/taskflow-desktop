# Stage 9.7 — Rich Markdown Toolbar & Calendar Day View (v0.9.7)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/rich-editor` (from `main`; `main` first merged
  `stage9/final-polish`)
- **Commit:** `stage9(7): rich markdown toolbar & calendar day panel`

## Part 1 — Category badge on KB cards

- `KbCard.tsx`: the note title now shows a category pill
  (`styles.categoryBadge`, accent tokens), matching the article page.

## Part 2 — Rich Markdown toolbar

- New `src/components/kb/MarkdownToolbar.tsx` (+ CSS module), placed above the
  editor `<textarea>` in `KbArticlePage.tsx`.
- Groups:
  - Text: **B** `**…**`, *I* `*…*`, ~~S~~ `~~…~~`;
  - Headers: H1/H2/H3 (`# `, `## `, `### ` line prefix);
  - Lists: `- ` and `1. ` line prefix;
  - Blocks: quote `> `, code block (wraps with ` ``` `);
  - Insert: link `[текст](https://)`, 3×3 table template.
- Uses `selectionStart`/`selectionEnd`: wraps the selected text, or inserts a
  placeholder and selects it so the cursor lands in the middle. The
  Editor/Preview tabs are untouched.

## Part 3 — Calendar day view

- `CalendarPage.tsx`: new `selectedDay` state; clicking a day cell opens a
  slide-in side panel listing **all** tasks for that date (the day-cell click
  is stopped on task chips so opening a task still works).
- The panel is rendered **inside the same `DndContext`** as the grid and the
  «Без срока» sidebar, so:
  - tasks can be dragged from the panel onto another day;
  - tasks can be dragged from the calendar into «Без срока» while the panel is
    open (the panel sits in-flow next to the sidebar, so both stay visible and
    droppable).
- The panel uses `DraggableTask` (same drag behavior) and opens the task detail
  on click; a ✕ button closes it.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.7                      |

## Release

- Commit: `stage9(7): rich markdown toolbar & calendar day panel`
- Tag `v0.9.7` pushed to GitHub (triggers the release workflow).

## Notes

- The day panel is an in-flow right-hand column (not a fixed overlay) so the
  «Без срока» drop target remains reachable; it still animates in from the
  right.
- No unrelated code was refactored.
