# Stage 7.1 — Global Search & Command Palette

- **Status:** implemented, gates green
- **Branch:** `stage7/global-search`
- **Commit:** `stage7(1): global search & command palette`

## Goal

Add a global search (command palette) opened with **Ctrl+K / Cmd+K** so users can
find tasks and notes instantly without switching pages.

## Backend (Rust)

New module `src-tauri/src/commands/search.rs`, registered in `commands/mod.rs`
and the Tauri handler in `lib.rs`.

### Command

```rust
global_search(query: String, space_id: Option<String>) -> GlobalSearchResults
```

```rust
struct GlobalSearchResults { tasks: Vec<TaskSearchResult>, notes: Vec<NoteSearchResult> }
struct TaskSearchResult { id, title, status, priority, dueDate, spaceId, spaceName }
struct NoteSearchResult { id, title, category, status, spaceId, spaceName }
```

### Behaviour

- **Matching:** case-insensitive substring.
  - Tasks: `title` and `description`.
  - Notes: `title` and the body of `note.md` (content is read only when the
    title does not already match).
- **Access control:** a non-admin searches only spaces they are a member of;
  admins search every space. Passing `spaceId` narrows to one space and returns
  `FORBIDDEN` if the session cannot access it.
- **Visibility:** task results respect `task.view_all` vs author/assignee, so
  search cannot reveal tasks the list command would hide. Notes require
  `article.view`, except in the user's own personal space (owner bypass).
- **Limits:** at most **10 tasks** and **10 notes**.
- Empty/whitespace query returns an empty result (the UI shows "Недавние").

### Tests (7)

- title/description task matches, title/content note matches;
- empty query;
- non-admin cannot see or request foreign spaces, admin sees all;
- `spaceId` scoping;
- 10-item limit;
- executor only finds visible tasks.

## Frontend

### Dependencies

- Added `cmdk@^1.1.1` (command palette primitives, keyboard navigation,
  accessible dialog).

### New files

- `src/services/search.ts` — typed `SearchService.global(query, spaceId?)`.
- `src/stores/useRecentStore.ts` — last 5 viewed tasks/notes, persisted in
  `localStorage` under `taskflow.recent`, de-duplicated by kind + id.
- `src/components/search/CommandPalette.tsx` + `.module.css`.
- `src/services/search.test.ts`.

### Behaviour

- **Shortcut:** `Ctrl+K` / `Cmd+K` toggles the palette from anywhere in
  `WorkspaceLayout`; `Esc` closes it.
- **Topbar:** a search button with the `Ctrl K` (`⌘ K` on macOS) hint opens the
  palette.
- **Debounce:** 300 ms before calling `globalSearch`.
- **Results:** grouped into "Задачи" (📋) and "Заметки" (📖/category icon); each
  row shows the space name.
- **Empty query:** "Недавние" — the last five opened tasks/notes.
- **Navigation:**
  - task → switches to the task's space, then `/app/tasks?task=<id>`;
    `TasksPage` reads the `task` query param and opens `TaskDetailPanel`;
  - note → switches to the note's space, then `/app/kb/:id`.
- **Recent recording:** `TaskDetailPanel` records tasks on open;
  `KbArticlePage` records notes once loaded.

### Design decisions

- `shouldFilter={false}`: filtering is done server-side, so cmdk must not filter
  results again. Keyboard selection still works via stable item `value`s.
- Notes physically stored in accessible spaces are searched. Notes merely
  _shared into_ a space are found only if the user also belongs to the source
  space (same limitation as the Stage 6 KB list; recorded as a follow-up).
- Search is global; the optional `spaceId` is wired through the service for
  future space-scoped search.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **137 passed**, 0 failed                              |
| `npm run test`  | **109 passed** (22 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/search.rs        (new)
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
src/services/search.ts                  (new)
src/services/search.test.ts             (new)
src/stores/useRecentStore.ts            (new)
src/components/search/CommandPalette.tsx          (new)
src/components/search/CommandPalette.module.css   (new)
src/pages/layout/WorkspaceLayout.tsx
src/pages/layout/WorkspaceLayout.module.css
src/pages/tasks/TasksPage.tsx
src/components/tasks/TaskDetailPanel.tsx
src/pages/kb/KbArticlePage.tsx
package.json / package-lock.json        (cmdk)
docs/reports/stage6-spaces.md           (new)
.ai/INSTRUCTIONS.md                     (new)
README.md
```

## Known limitations / follow-ups

- No relevance ranking or match highlighting yet; results keep file order.
- Shared-into-space notes are not indexed by global search.
- The command palette currently searches globally only (the backend supports
  scoping by `spaceId`).
- Bundle size grows (~+58 kB minified) because of cmdk/Radix Dialog; code
  splitting is a possible follow-up.
