# Stage 10.1 — Obsidian Core: Wiki-links, Backlinks & Graph Plugin (v0.10.0)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage10/obsidian-core` (from `main`; `main` first merged
  `stage9/final-fixes`)
- **Commit:** `stage10(1): wiki-links, backlinks & graph plugin`

All Obsidian features are gated by the `obsidian-graph` plugin: enabled only
when the extension system is on **and** `pluginStates["obsidian-graph"] === true`.

## Part 1 — Gated wiki-links

- `KbArticlePage.tsx`: when the plugin is enabled, `[[Title]]` is rewritten to
  `[Title](wikilink:…)`; the `a` renderer maps it to a `WikiLink` that calls
  `notesResolveTitle` and navigates to the note, or prompts to create it when
  missing. When disabled, no rewrite happens and `[[Title]]` stays plain text.
- Backend `notesResolveTitle` (case-insensitive exact title → id, `article.view`).
- `MarkdownToolbar`: new `[[ ]] Ссылка` button rendered only when
  `obsidianEnabled`; inserts `[[]]` with the caret between the brackets.

## Part 2 — Gated backlinks

- Backend `notesGetBacklinks(spaceId, noteTitle)` scans every note's content for
  `[[noteTitle]]` (case-insensitive) and returns the matching `NoteMeta`s.
- `KbArticlePage` renders a «Ссылаются на эту заметку» block at the bottom of
  the read view (only when the plugin is enabled).

## Part 3 — Graph plugin

- New bundled plugin `src-tauri/resources/plugins/obsidian-graph/`:
  - `manifest.json` — id `obsidian-graph`, name «Obsidian Core (Граф)»,
    version `1.0.0`, `ui.inject: "sidebar"`.
  - `index.html` — fetches notes + each note's content through the postMessage
    bridge, parses `[[…]]`, and renders a `vis-network` graph (CDN). Clicking a
    node sends `navigate` → `/app/kb/{id}`.
- `install_default_plugins_from` now installs **every** bundled plugin folder
  (not just `llm-assistant`), and `tauri.conf.json` bundles
  `resources/plugins/obsidian-graph`.
- `PluginFrame.runAction` gained a whitelisted `navigate` action (paths must
  start with `/app`) so plugins can open app routes.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.10.0                     |

## Release

- Commit: `stage10(1): wiki-links, backlinks & graph plugin`
- Tag `v0.10.0` pushed to GitHub (triggers the release workflow).

## Notes

- The graph plugin needs network access for the `vis-network` CDN on first
  load; if offline, it shows an error message. CSP is disabled, so the CDN
  script runs.
- New wiki-created notes use the current article's category (fallback
  «Импорт»).
- No unrelated code was refactored.
