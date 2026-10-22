# Stage 7.2 — In-App Notifications

- **Status:** implemented, gates green
- **Branch:** `stage7/notifications`
- **Commit:** `stage7(2): in-app notifications`

## Goal

Show a bell in the topbar that lights up when the current user is assigned a
task, mentioned in a comment, or added to a space. The bell polls every 30 s so
events from other users appear without a page reload.

## Backend (Rust)

### Model & storage — `src-tauri/src/notifications.rs`

```rust
struct Notification {
    id: String,
    user_id: String,
    kind: NotificationType,   // serialized as "type"
    title: String,
    message: String,
    link_to: Option<String>,
    is_read: bool,
    created_at: String,
}

enum NotificationType { TaskAssigned, CommentMention, SpaceAdded }
```

- Stored per user at `notifications/{userId}.json` (array), sorted newest first
  when read.
- Per-user file is capped at **100** entries (newest kept) to keep SMB folders
  bounded.
- User ids are validated before building the path (no traversal).
- `mark_read` / `mark_all_read` are idempotent and only touch the caller's file.
- Reads/writes reuse `fsops` (atomic replace, long-path safe).

### Commands — `src-tauri/src/commands/notifications.rs`

| Command                     | Behaviour                                      |
| --------------------------- | ---------------------------------------------- |
| `notificationsList`         | current user's notifications, `createdAt` desc |
| `notificationsMarkRead(id)` | marks one as read                              |
| `notificationsMarkAllRead`  | marks all as read                              |

All three require an authenticated session and operate only on
`session.user_id`.

### Generation hooks (best-effort)

Notifications never fail the underlying write: failures are logged with
`tracing::warn!` and the task/space operation still succeeds.

- **Task assigned** (`tasks_create`): every assignee of a new task is notified,
  except the actor.
- **Task assigned** (`tasks_update`): only assignees newly added compared to the
  previous task version are notified, except the actor.
- **Comment mention** (`tasks_update`): new comments authored by the actor are
  diffed by comment id; `@login` tokens are resolved against active users.
  Trailing punctuation is tolerated (`@bob,` / `@bob.`), and duplicate mentions
  in one update produce one notification. Mentions of the actor are skipped.
- **Space added** (`spaces_update`): users newly present in `members` are
  notified, except the actor.

Link targets:

- task events → `/app/tasks?task=<taskId>&space=<spaceId>`
- space events → `/app/dashboard?space=<spaceId>`

The `space` query parameter lets the UI switch to the right space before
navigating.

### Tests (9)

Storage: newest-first + cap, mark-read / mark-all, per-user isolation + id
validation, mention parsing/dedupe.

Commands: task-creation notifications (assignee only, not actor), update
notifies only new assignees, comment mention, space-added, and
mark-read only touches the current user's file.

## Frontend

### New files

- `src/services/notifications.ts` — typed commands.
- `src/stores/useNotificationStore.ts` — list + optimistic mark-read with
  re-sync on failure.
- `src/components/notifications/NotificationBell.tsx` + `.module.css`.
- `src/services/notifications.test.ts`.

### Behaviour

- Bell button next to the search field in the topbar.
- Red dot when at least one notification is unread.
- Click opens a dropdown panel:
  - type icon, title, message, relative time;
  - unread rows use a bold title and accent background;
  - "Отметить все как прочитанные" appears while unread items exist.
- Clicking a notification marks it read, switches to its space (from the link's
  `space` query param), and navigates to `linkTo`.
- **Polling:** `WorkspaceLayout` fetches on mount and every **30 s**
  (`setInterval`), so assignments from other users appear without reloading.

### Design decisions

- Notifications are generated server-side (not by the acting client), so they
  work for the recipient's next poll even if their UI is idle.
- Self-notifications are suppressed (assigning yourself / adding yourself to a
  space produces no bell noise).
- The link embeds the space id so the client can select the space before the
  task panel opens.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **146 passed**, 0 failed                              |
| `npm run test`  | **112 passed** (23 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/notifications.rs                    (new)
src-tauri/src/commands/notifications.rs           (new)
src-tauri/src/commands/mod.rs
src-tauri/src/commands/tasks.rs                   (hooks)
src-tauri/src/commands/spaces.rs                  (hook)
src-tauri/src/lib.rs                              (module + handlers)
src/services/notifications.ts                     (new)
src/services/notifications.test.ts                (new)
src/stores/useNotificationStore.ts                (new)
src/components/notifications/NotificationBell.tsx          (new)
src/components/notifications/NotificationBell.module.css   (new)
src/pages/layout/WorkspaceLayout.tsx              (bell + polling)
```

## Known limitations / follow-ups

- Notifications use a read-modify-write on `notifications/{userId}.json`; two
  simultaneous writers for the same recipient could lose one entry. A per-user
  lock (or per-notification files) would remove this race.
- Polling is 30 s; there is no push/websocket channel.
- No notifications for status changes, due dates, or note shares yet.
- The bell shows up to 100 items; older entries are dropped.
