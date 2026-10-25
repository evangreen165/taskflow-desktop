# Stage 10.2 — Wiki-link Autocomplete, PDF Viewer & Daily Notes (v0.10.1)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/learning-pdf` (from `main`; `main` first merged
  `stage10/obsidian-core`)
- **Commit:** `stage10(2): wiki-link autocomplete, pdf viewer & daily notes`

## Part 1 — Wiki-link autocomplete

`KbArticlePage.tsx` (ArticleEditor, only when the Obsidian plugin is enabled):
- Loads all notes via `NotesService.list(spaceId)`.
- Typing `[[` opens a caret-anchored dropdown (`position: fixed`, coordinates
  from a textarea caret mirror) listing notes filtered by the text typed after
  `[[` (case-insensitive, max 8).
- Clicking a suggestion inserts `[[Note Title]]` and closes the dropdown;
  Enter inserts the first match, Enter with no matches / Escape closes it.
- The dropdown closes on blur (suggestion clicks use `onMouseDown` +
  `preventDefault` so the textarea keeps focus).

## Part 2 — Inline PDF viewer

`MarkdownAttachments.tsx`:
- `AttachmentLink` detects a `.pdf` label on an `attachment://` link and renders
  `PdfAttachment` instead of a plain link.
- `PdfAttachment` fetches the `attachmentGetBase64` data URL and renders
  `<object type="application/pdf" width=100% height=600>` (scrollable inline),
  with a «📄 filename» fallback link that opens the file in the OS viewer.

## Part 3 — Daily notes

- Backend: `config.json > dailyNoteFormat` (default `YYYY-MM-DD`) with
  `workspaceGetDailyNoteFormat` / `workspaceSetDailyNoteFormat`
  (`workspace.settings`).
- Calendar day panel: «📓 Дневник на этот день» resolves the note named by the
  configured format (`notesResolveTitle`); if missing it ensures the «Дневник»
  category, creates the note, and navigates to `/app/kb/{id}`.
- Settings → Общие (admin): «Формат названия дневника» input with save.
  The stored `YYYY/YY/DD/D` tokens are mapped to date-fns `yyyy/yy/dd/d`.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.1                     |

## Release

- Commit: `stage10(2): wiki-link autocomplete, pdf viewer & daily notes`
- Tag `v0.10.1` pushed to GitHub (triggers the release workflow).

## Notes

- The PDF viewer uses a base64 data URL (`<object>`), which is reliable in
  WebView2 (a custom-protocol iframe can be blocked).
- The autocomplete dropdown is positioned from a caret mirror (clamped to the
  viewport); no unrelated code was refactored.
