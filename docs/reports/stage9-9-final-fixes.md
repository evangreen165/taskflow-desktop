# Stage 9.9 — Final Editor & Calendar DnD Fixes (v0.9.9)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/final-fixes` (from `main`; `main` first merged
  `stage9/markdown-fixes`)
- **Commit:** `stage9(9): fix image center, editor scroll & calendar dnd`

## Bug 1 — Image centering buttons

`KbArticlePage.tsx`:
- New `buildImageMarkup(sha, width, align)`:
  - Center → `<div align="center"><img src="attachment://sha" width="…" /></div>`;
  - Left/Right → `<div><img src="attachment://sha" width="…" style="float: left|right;" /></div>`.
- `resizeImageInMarkdown` now replaces an existing wrapped block, a bare
  `<img>`, or the Markdown image, so repeated alignment clicks work.
- `rehype-raw` is enabled in both the read view and the editor preview, so the
  generated HTML renders.

## Bug 2 — Editor jumps to the bottom

`ArticleEditor` (in `KbArticlePage.tsx`):
- The caret (`selectionStart`/`selectionEnd`) and `scrollTop` are saved before
  every content update and restored in a **`useLayoutEffect`** (`focus()` +
  `setSelectionRange()` + `scrollTop`), which runs before paint.
- Toolbar actions now go through the same `handleContentChange` path, so
  formatting no longer jumps the editor either (the toolbar still places the
  caret at the inserted text afterwards).
- `insertMarkdown` (image/file insertion) also restores `scrollTop`.

## Bug 3 — Drag from Day Panel to «Без срока»

`CalendarPage.module.css`:
- The day panel is in-flow (never an overlay), `position: relative;
  z-index: 40`;
- the «Без срока» sidebar is `position: relative; z-index: 50;
  pointer-events: auto`, so it stays visible and accepts drops while the panel
  is open. Both remain inside the same `DndContext`, and the existing
  `calendarCollision` still prioritises the sidebar under the pointer.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.9                      |

## Release

- Commit: `stage9(9): fix image center, editor scroll & calendar dnd`
- Tag `v0.9.9` pushed to GitHub (triggers the release workflow).

## Notes

- The editor is a local component in `KbArticlePage.tsx` (there is no separate
  `ArticleEditor.tsx`), so the scroll/alignment fixes were applied there.
- No unrelated code was refactored.
