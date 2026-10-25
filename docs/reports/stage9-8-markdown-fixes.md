# Stage 9.8 — Markdown Fixes, Links & Calendar DnD (v0.9.8)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/markdown-fixes` (from `main`; `main` first merged
  `stage9/rich-editor`)
- **Commit:** `stage9(8): fix markdown lists, tables, links & calendar dnd`

## Part 1 — Links & external navigation

- New Rust command `openExternal` (`commands/workspace.rs`, registered in
  `lib.rs`): `http(s)` → `open_url` (default browser); anything else
  (local file/folder paths, `file://` normalised) → `open_path` (OS file
  explorer).
- New `services/system.ts` (`SystemService.openExternal`).
- `MarkdownAttachments.tsx` `AttachmentLink`: attachment links keep the
  `attachmentOpen` flow; `#anchor` links stay native; every other link calls
  `preventDefault` and `openExternal`, so the webview never navigates away
  (which froze the app). Used by both the read view and the preview.

## Part 2 — Toolbar lists & tables

`MarkdownToolbar.tsx`:
- Lists now operate on the full selected block: numbered lists renumber
  (`1.`, `2.`, …), bullets apply `- ` to every line, and clicking again on an
  already-prefixed block toggles the prefix off.
- Table button prompts for rows/columns (default 3×3) and inserts a clean
  header + separator + body table.

## Part 3 — Scroll jumping

`ArticleEditor` (in `KbArticlePage.tsx`): the textarea `onChange` saves the
caret (`selectionStart`/`selectionEnd`) and `scrollTop` in a ref and restores
them in a `useEffect` after the state update. `insertMarkdown` (image/file
insertion) also restores `scrollTop`, so the editor no longer jumps to the
bottom.

## Part 4 — Strict category dropdown

- `ArticleEditor`: the category datalist is replaced with a `<select>` populated
  from `notesListCategories` plus a «+» button (`window.prompt` →
  `useNoteStore.addCategory` → `notesCreateCategory`). An unknown current value
  is shown as an option so edits don't lose it.
- `NewNoteModal`: same strict `<select>` + «+»; the first category is
  preselected after loading.

## Part 5 — Calendar day-panel DnD

Root cause: the day panel rendered the same tasks as the calendar grid, so two
draggables shared one dnd-kit `id`, breaking drags. Day-panel chips now use
`panel:<taskId>`, and `handleDragEnd` strips the prefix. The panel and the
«Без срока» sidebar remain in-flow inside the same `DndContext`, so dragging
from the panel onto a day or into «Без срока» works.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.8                      |

## Release

- Commit: `stage9(8): fix markdown lists, tables, links & calendar dnd`
- Tag `v0.9.8` pushed to GitHub (triggers the release workflow).

## Notes

- There is no separate `ArticleEditor.tsx`; the editor is a local component in
  `KbArticlePage.tsx`, so the fixes were applied there.
- No unrelated code was refactored.
