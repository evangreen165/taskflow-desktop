# Stage 9.5 — Due Times, Trash, Audit Fixes & UX Polish (v0.9.5)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/polish` (from `main`; `main` first merged `stage9/audit-ux`)
- **Commit:** `stage9(5): due time, auto-delete, audit fixes & ui polish`

## Part 1 — Trash tab & auto-deletion

- `tasks.rs`: new `TaskStatus::Trash` and `Task.trashedAt: Option<String>`
  (`skip_serializing_if` when absent). `change_status` stamps `trashedAt` when
  entering trash and clears it when leaving. New `purge_trashed(root, days)`.
- `tasks_list`: before listing, sweeps trashed tasks older than
  `trashRetentionDays` (default 7, 0 = off) in a blocking task.
- `workspace.rs`: `trashRetentionDays` + `dueSoonNotifyMinutes` config fields,
  `TaskSettings` DTO, `workspaceGetTaskSettings`/`workspaceSetTaskSettings`.
- Frontend: `KANBAN_COLUMNS` gains «На удаление» (6th column, no «+» button);
  trash status type + `trashedAt` in the service; gray dot style.

## Part 2 — Due time & notifications

- `TaskDetailPanel`: due date input is now `datetime-local` (ISO
  `YYYY-MM-DDTHH:mm`). The backend already stores ISO strings; date-range
  filtering still compares the `YYYY-MM-DD` prefix.
- `notifications.rs`: new `TaskExpiringSoon` type + `on_tasks_due_soon`, which
  parses RFC3339 / `YYYY-MM-DDTHH:mm` / `YYYY-MM-DD`, and notifies assignees
  when a task is due within `dueSoonNotifyMinutes` (default 60, 0 = off),
  skipping done/rejected/trashed tasks and deduping per task (unread check).
  Called from `tasks_list` (polling path).

## Part 3 — Collapsed sidebar user menu

- `WorkspaceLayout`: the user menu now renders with `position: fixed`,
  anchored to the avatar button's rect (computed on open), so it is no longer
  clipped by the sidebar in collapsed mode.

## Part 4 — Notes category badge

- `KbArticlePage`: the article title shows a «Категория: …» pill
  (`.categoryBadge` using the accent tokens).

## Part 5 — Audit log fixes

- `audit::emit` added to `tasks_create` (`task.create`), `tasks_update`
  (`task.edit`), `tasks_change_status` (`task.status`), `tasks_delete`
  (`task.delete`), `notes_create`/`notes_update`/`notes_delete`
  (`article.create`/`article.edit`/`article.delete`). `users_update` already
  emitted `user.update`.
- `AdminPage` audit tab: loads the user list and resolves `u:<uuid>` to the
  user's `displayName` (fallback short id); system actors render as
  «Система (reason)».

## Part 6 — Developer logs

- `openLogFolder` command (tauri-plugin-opener) opens
  `<app_data_dir>/logs` (created if missing).
- Settings → Общие → «Диагностика»: «Открыть папку с логами» button.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.5                      |

## Release

- Commit: `stage9(5): due time, auto-delete, audit fixes & ui polish`
- Tag `v0.9.5` pushed to GitHub (triggers the release workflow).

## Notes

- The permanent «Удалить задачу» button still deletes immediately; the trash
  column is the soft-delete path (drag a card there) with the retention sweep.
- Existing `KANBAN_COLUMNS` test updated for the 6th column.
- No unrelated code was refactored.
