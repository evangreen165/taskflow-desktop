# Stage 7.4 — Dashboard Charts & Loading Skeletons

- **Status:** implemented, gates green
- **Branch:** `stage7/polish`
- **Commit:** `stage7(4): dashboard charts & ui skeletons`

## Task 1 — Dashboard analytics widget

### Dependency

- Added `recharts` (`^3.10.1`).

### New widget

- `WidgetId` gained `"analytics"`; `WIDGET_DEFS` shows **«Аналитика»**.
- Default layout places it at `x: 8, y: 4, w: 4, h: 5` (`minW: 4`, `minH: 4`),
  so it is draggable/resizable like every other dashboard widget.
- `readInitial` now merges any missing default layout entries into a previously
  saved `localStorage` layout, so existing users get the new widget without
  resetting their dashboard.

### Charts — `src/components/dashboard/AnalyticsWidget.tsx`

Data source: `TasksService.list(currentSpaceId, {})`, refreshed on space change
and every 30 s (the same SMB polling fallback as the rest of the dashboard).

- **Pie — «Задачи по статусам»**: New / In Progress / Review / Done, using the
  global color tokens (`--blue`, `--amber`, `--accent`, `--green`) directly in
  the SVG `fill`s. Zero-value slices are omitted.
- **Bar — «Загрузка исполнителей»**: number of **active** tasks (not `done` /
  `rejected`) per assignee, sorted desc, top 8. Assignee names come from
  `useUserDirectory`; the id prefix is used until the directory resolves.
- Tooltip/legend/axis colors use the surface/text tokens so both themes are
  readable.
- Empty states: "нет задач" / "нет активных задач с исполнителями".

## Task 2 — Loading skeletons

### New component

`src/components/ui/Skeleton.tsx` + `.module.css`:

- a `<span>` placeholder with configurable `width`, `height`, `radius`, and an
  animated shimmer gradient built from `--surface-2`/`--border`;
- respects `prefers-reduced-motion: reduce` (animation disabled).

### Pages

- **TasksPage**: replaced «Загрузка задач…» with a 3-column skeleton board
  (column header + three task cards per column).
- **KbPage**: replaced «Загрузка…» with six skeleton article cards in the
  existing responsive grid.
- **DashboardPage**: replaced «Загрузка…» with five skeleton widget cards in a
  3-column grid while the summary is loading.

The real content still renders only after loading completes, so there is no
layout jump between skeleton and data.

## Gates

| Gate            | Result                                   |
| --------------- | ---------------------------------------- |
| `cargo test`    | **154 passed**, 0 failed                 |
| `npm run test`  | **115 passed** (24 files)                |
| `npm run lint`  | clean (`--max-warnings 0`)               |
| `npm run build` | success (tsc + vite; chunk-size warning) |

> Bundle grew from ~928 kB to ~1.34 MB (minified) because of `recharts`. Code
> splitting the dashboard/charts is a sensible follow-up if startup size matters.

## Files touched

```
package.json / package-lock.json                  (recharts)
src/stores/useDashboardStore.ts                   (analytics widget + layout merge)
src/components/dashboard/AnalyticsWidget.tsx      (new)
src/components/dashboard/AnalyticsWidget.module.css (new)
src/components/ui/Skeleton.tsx                    (new)
src/components/ui/Skeleton.module.css             (new)
src/pages/dashboard/DashboardPage.tsx             (analytics + skeletons)
src/pages/dashboard/DashboardPage.module.css
src/pages/tasks/TasksPage.tsx                     (skeleton board)
src/pages/tasks/TasksPage.module.css
src/pages/kb/KbPage.tsx                           (skeleton cards)
src/pages/kb/KbPage.module.css
docs/reports/stage7-4-polish.md                   (this report)
```

## Known limitations / follow-ups

- Analytics is scoped to the **current space** (as requested); a cross-space
  aggregate would need a new backend summary endpoint.
- `rejected` tasks are intentionally excluded from the pie (the spec lists four
  statuses) and from the workload count.
- No automated tests cover Recharts rendering (jsdom lacks layout); the store
  and chart data shaping are simple and covered by TypeScript.
- Bundle size increase from recharts is not code-split yet.
