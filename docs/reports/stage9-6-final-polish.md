# Stage 9.6 — Audit Spaces, Task Due Time & Analytics Redesign (v0.9.6)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/final-polish` (from `main`; `main` first merged `stage9/polish`)
- **Commit:** `stage9(6): fix audit spaces, task due time & analytics widget`

## Part 1 — Audit log: spaces & system events

- `commands/spaces.rs`: `audit::emit` added to `spaces_create` (`space.create`),
  `spaces_update` (`space.update`), `spaces_delete` (`space.delete`), with the
  space name in the details.
- `AdminPage` audit tab: `s:<reason>` actors are translated to Russian —
  `s:init` → «Система (Создание воркспейса)», `s:migrate` → «Система (Миграция
  данных)», `s:activate` → «Система (Активация воркспейса)» (unknown reasons
  fall back to the raw reason).

## Part 2 — Task due time (date + time)

Root cause: `taskToDraft` used `toDateInput` (`iso.slice(0,10)`), truncating the
time — so the `datetime-local` input was re-seeded with a date-only value and
the selected time was lost on re-render.

- `lib/taskEditor.ts`: new `toDateTimeInput` (ISO → local `YYYY-MM-DDTHH:mm`,
  date-only legacy → `T00:00`); `taskToDraft` uses it; `fromDateInput` now
  converts the local input value to a full ISO string via `toISOString()`
  (empty → `null`).
- Backend: `tasks_update` already stores the full `dueDate` string unchanged —
  no truncation.
- `lib/taskMeta.ts`: new `formatDueDateTime` — returns date + time, treating
  date-only values and local 00:00 as date-only.
- `TaskCard` / `TaskListView`: show `📅 25 окт, 14:30` when a time is set,
  otherwise `📅 25 окт`.
- Tests updated for the new helpers (120 frontend tests).

## Part 3 — Analytics widget redesign

`AnalyticsWidget.tsx`:
- Single chart at a time with a segmented control «По статусам» /
  «По исполнителям» at the top right.
- Status chart is a larger donut: `innerRadius={50}`, `outerRadius={80}`.
- Chart container uses `ResponsiveContainer width="100%" height="100%"` inside
  a `flex: 1; min-height: 280px` wrapper so it fills the widget.
- CSS: `.toolbar`, `.segmented`, `.segActive`, `.chartWrap`.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **170 passed**                         |
| `npm run test`         | **120 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.6                      |

## Release

- Commit: `stage9(6): fix audit spaces, task due time & analytics widget`
- Tag `v0.9.6` pushed to GitHub (triggers the release workflow).

## Notes

- `toDateInput` is kept for compatibility; the editor now uses
  `toDateTimeInput`.
- No unrelated code was refactored.
