# Stage 8.13 — Release CSP, Iframe Blob & SMB Performance (v0.8.3)

- **Status:** implemented, gates green
- **Branch:** `main`
- **Commit:** `stage8(13): fix release CSP, iframe blob url & SMB performance`

## Task 1 — Iframe blocked in production (CSP)

- CSP updated:
  - `frame-src 'self' blob: data:` (Blob frames explicitly allowed);
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;
  - `style-src 'self' 'unsafe-inline'`;
  - `img-src 'self' asset: http://asset.localhost data: blob:`;
  - `connect-src` includes Ollama (`127.0.0.1`/`localhost:11434`) and
    OpenRouter/OpenAI.
- `PluginFrame` renders the plugin from a **Blob URL** (`URL.createObjectURL`,
  revoked on change/unmount) — this was already in place from 8.12 and is
  confirmed as the production path.

## Task 2 — SMB performance freezes

### Rust: read paths moved off the main thread

Converted to `async fn` + `tokio::task::spawn_blocking` (auth/access checks stay
on the async side; only file work is offloaded):

| Command                                          | Heavy work offloaded                   |
| ------------------------------------------------ | -------------------------------------- |
| `tasksList` / `tasksGet`                         | `tasks::list` / `tasks::get`           |
| `notesList` / `notesGet` / `notesListCategories` | note metas/previews/content/categories |
| `dashboardSummary`                               | cross-space tasks + notes scan         |
| `notificationsList`                              | notifications file                     |
| `spacesList` / `spacesGet` / `spacesGetMembers`  | spaces + users scan                    |

Workspace **activation/init** (`activateWorkspace` / `initWorkspace`) now run
`workspace::validate`/`init`, `migrate::run`, `backfill::run` and the bundled
plugin install inside `spawn_blocking`, so opening a slow SMB workspace no
longer freezes the UI.

### Watcher debounce

`DEBOUNCE` raised **150 ms → 700 ms → 1000 ms**. A single SMB save produces
many events; the frontend now receives one batch after the drive settles.

### Frontend polling

Verified the 30 s polls skip while a request is in flight:
`useTaskStore.fetchTasksSilently`, `useNotificationStore.fetch`,
`DashboardPage` `summaryFetchRef`/`spaceTasksFetchRef`.

## Task 3 — Sync & release

- Version **0.8.3** in `package.json`, `tauri.conf.json`, `package-lock.json`;
  `npm run version:check` → OK.
- CHANGELOG `[0.8.3]` section.
- Commit, tag `v0.8.3`, push `main` + tags.

## Gates

| Gate            | Result                     |
| --------------- | -------------------------- |
| `cargo test`    | **162 passed**, 0 failed   |
| `npm run test`  | **119 passed** (26 files)  |
| `npm run lint`  | clean (`--max-warnings 0`) |
| `npm run build` | success                    |

## Files touched

```
src-tauri/tauri.conf.json                 (CSP frame-src blob:, version)
src-tauri/src/watcher.rs                  (1000 ms debounce)
src-tauri/src/commands/tasks.rs           (tasksList/tasksGet async)
src-tauri/src/commands/notes.rs           (notesList/notesGet/categories async)
src-tauri/src/commands/dashboard.rs       (dashboardSummary async)
src-tauri/src/commands/notifications.rs   (notificationsList async)
src-tauri/src/commands/spaces.rs          (spacesList/get/members async)
src-tauri/src/commands/workspace.rs       (activation/init async + spawn_blocking)
package.json / package-lock.json          (0.8.3)
CHANGELOG.md                              (0.8.3)
docs/reports/stage8-13-release-csp-smb.md (this report)
```

## Known limitations / follow-ups

- Write commands (create/update task, note, user, role, space) still do small
  file writes on the command thread; they are user-initiated, not polled.
- If freezes persist on a specific GPU/driver, `additionalBrowserArgs:
"--disable-gpu"` remains the documented last resort.
