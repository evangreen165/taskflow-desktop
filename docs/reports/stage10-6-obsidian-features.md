# Stage 10.6 — Gating Fixes, Calendar Fixes & Note Embeds/Aliases (v0.10.5)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/obsidian-features` (from `main`; `main` first merged
  `stage10/fix-ui`)
- **Commit:** `stage10(6): fix gating, daily notes, and add note embeds & aliases`

## Part 1 — Toolbar gating

`MarkdownToolbar.tsx`: the Callout 💡 dropdown, Templates 📋 button/menu and the
Wiki-link 🔗 button are all rendered only when `obsidianEnabled` is true; with
the plugin disabled none of them appear.

## Part 2 — Daily notes calendar logic

`CalendarPage.tsx` `notesForDate`: a note belongs to a day if its local
`createdAt` date matches **or** its title exactly matches the daily format for
that specific day (case-insensitive). This makes a daily note created for a
past/future date show up on that day. No title filtering of other notes and no
limit.

## Part 3 — Autocomplete

`KbArticlePage.tsx`: removed the 8-item cap and matches notes by title **and**
aliases. CSS: `.wikiSuggest { max-height: 200px; overflow-y: auto; }` so all
notes are scrollable.

## Part 4 — Note embeds `![[Note Title]]`

- `preprocessEmbeds` rewrites `![[Title]]` to a `noteembed:` link (only when the
  plugin is enabled), applied before wiki-link/callout preprocessing.
- `NoteEmbed` resolves the note, fetches its content and renders it inline in a
  styled box (`📄 Title` + content, wiki-links inside are rendered as links;
  embeds inside embeds are not expanded to avoid recursion).
- Typing `![[` in the editor triggers the same autocomplete and inserts
  `![[Title]]` instead of `[[Title]]`.

## Part 5 — Aliases

- Backend: `NoteMeta.aliases: Vec<String>` (serde default), included in
  `notesUpdate` (new `aliases` argument, normalized/deduped) and
  `notesResolveTitle` checks the title **or** any alias.
- Frontend: `NoteDraft`/`NotePatch` carry aliases (autosaved via `notesUpdate`);
  the article editor has an «Алиасы» input (comma-separated, commits on
  blur/Enter); the autocomplete matches aliases too.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.5                     |

## Release

- Commit: `stage10(6): fix gating, daily notes, and add note embeds & aliases`
- Tag `v0.10.5` pushed to GitHub (triggers the release workflow).

## Notes

- `notesUpdate` gained an `aliases` argument; frontend service/hook and the
  affected tests were updated accordingly.
- No unrelated code was refactored.
