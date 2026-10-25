# Changelog

All notable changes to TaskFlow are documented in this file.

## [0.10.2] - 2026-10-25

### Added

- **Daily-note calendar integration** (gated by the `obsidian-graph` plugin):
  day cells show a 📝 marker when a note was created on that date or a daily
  note matches the format; the day panel lists «Заметки этого дня» (click to
  open); the «📓 Дневник на этот день» button is only shown when the plugin is
  enabled
- **Callouts**: `> [!NOTE]` / `[!WARNING]` / `[!TIP]` / `[!IMPORTANT]` render
  as styled callout blocks (icons + accent colors); the toolbar has a 💡 button
  that inserts a NOTE template
- **Hierarchical tags**: the KB sidebar groups slash-separated tags
  (`#работа/проект` under `#работа`); clicking a group filters the notes
  matching the tag or its children (`работа/*`)
- **Templates**: a «📋 Шаблоны» toolbar dropdown with «Встреча», «База знаний»
  and «Дневник» templates inserted at the cursor

### Changed

- Version bumped to `0.10.2`

## [0.10.1] - 2026-10-25

### Added

- **Wiki-link autocomplete**: typing `[[` in the article editor (Obsidian
  plugin enabled) opens a caret-anchored dropdown of notes, filtered as you
  type; clicking a suggestion inserts `[[Title]]` (Enter picks the first,
  Escape/empty Enter closes it)
- **Inline PDF viewer**: `.pdf` attachment links render an embedded
  `<object type="application/pdf">` (base64) with a 600px scrollable viewer
  and an «open file» fallback link
- **Daily notes**: the calendar day panel has «📓 Дневник на этот день» — it
  resolves the note named by the configurable format, creating it in the
  «Дневник» category when missing, then navigates to it. Settings → Общие has
  the «Формат названия дневника» input (default `YYYY-MM-DD`, stored in
  `config.json > dailyNoteFormat`)

### Changed

- Version bumped to `0.10.1`

## [0.10.0] - 2026-10-25

### Added

- **Obsidian core (gated by the `obsidian-graph` plugin)**
  - Wiki-links `[[Название заметки]]`: when the plugin is enabled, they render
    as clickable links (`notesResolveTitle`); a missing note prompts to create
    it. When disabled, `[[…]]` stays plain text
  - Internal-link button `[[ ]]` in the Markdown toolbar (only when enabled)
  - **Backlinks**: `notesGetBacklinks` + a «Ссылаются на эту заметку» block at
    the bottom of the article (only when enabled)
  - **Graph plugin** `obsidian-graph` («Obsidian Core (Граф)», sidebar): draws a
    `vis-network` graph of notes and their `[[…]]` links; clicking a node opens
    the note. The default plugin installer now installs every bundled plugin
    (and the plugin is bundled via `tauri.conf.json` resources)
  - The plugin bridge gained a `navigate` action for plugin-driven navigation

### Changed

- Version bumped to `0.10.0`

## [0.9.9] - 2026-10-25

### Fixed

- **Image alignment**: «Центр» now writes
  `<div align="center"><img … /></div>`; «Слева»/«Справа» wrap the image in a
  `<div>` with `style="float: left/right;"` on the `<img>` so it clears
  correctly. `rehype-raw` renders the HTML in both read and preview modes
- **Editor scroll jump**: the caret and `scrollTop` are saved before any
  content update and restored in `useLayoutEffect` (also for toolbar actions),
  so typing and formatting no longer jump the editor to the bottom
- **Calendar DnD to «Без срока»**: the day panel is in-flow with `z-index: 40`
  and the unscheduled sidebar is `position: relative; z-index: 50;
  pointer-events: auto`, so it stays visible and accepts drops while the panel
  is open (collision detection still prioritises it)

### Changed

- Version bumped to `0.9.9`

## [0.9.8] - 2026-10-25

### Fixed

- **Markdown links no longer freeze the app**: `http(s)` links open in the
  default browser and local file/folder paths (including `file://`) open in the
  OS file explorer via the new `openExternal` command; the webview never
  navigates away
- **Toolbar lists & tables**: bullet/numbered lists now apply to every selected
  line, renumber, and toggle off; the table button asks for rows/columns and
  inserts a clean header + separator + body table
- **Editor scroll jumping**: the caret and `scrollTop` are preserved across
  controlled-textarea re-renders (typing and image insertion no longer jump to
  the bottom)
- **Strict category dropdown**: the article editor and «Новая статья» modal use
  a `<select>` populated from `notesListCategories`, with a «+» button that
  creates a new category via `notesCreateCategory`
- **Calendar day-panel DnD**: day-panel chips use unique drag ids (`panel:<id>`)
  so dragging from the panel to a day or into «Без срока» works again (the
  duplicate ids with the grid broke dnd-kit)

### Changed

- Version bumped to `0.9.8`

## [0.9.7] - 2026-10-25

### Added

- **Rich Markdown toolbar** for the article editor (`MarkdownToolbar`): bold,
  italic, strike, H1–H3, bullet/ordered lists, quote, code block, link, and a
  3×3 table template. Buttons wrap the textarea selection (or insert a
  placeholder with the cursor in the middle) via `selectionStart`/`selectionEnd`;
  the Editor/Preview tabs are unchanged
- **Calendar day panel**: clicking a day opens a slide-in side panel listing
  all tasks for that date. It is rendered inside the same `DndContext` as the
  grid, so tasks can be dragged from the panel onto another day, and from the
  calendar into the «Без срока» sidebar while it is open
- Category badge on knowledge-base cards (matching the article page)

### Changed

- Version bumped to `0.9.7`

## [0.9.6] - 2026-10-25

### Fixed

- **Task due time**: `taskToDraft` no longer truncates the due value to a date,
  the `datetime-local` input keeps the selected time, and `fromDateInput` saves
  the full ISO string. Task cards and the list now show `📅 25 окт, 14:30` when
  a time is set (date-only values and local 00:00 stay `📅 25 окт`)
- **Audit log**: space events are recorded (`space.create`, `space.update`,
  `space.delete`); `s:` system actors render as human-readable Russian
  («Создание воркспейса», «Миграция данных», «Активация воркспейса»)

### Changed

- **Analytics widget redesigned**: a single chart fills the widget with a
  segmented toggle «По статусам» / «По исполнителям»; the status donut is
  larger (`innerRadius={50}`, `outerRadius={80}`) and the chart uses
  `ResponsiveContainer width="100%" height="100%"`
- Version bumped to `0.9.6`

## [0.9.5] - 2026-10-25

### Added

- **Trash column & auto-deletion**: new `trash` status + `trashedAt`; the
  Kanban board has a 6th «На удаление» column (drag a task there to soft-delete
  it). `tasks_list` sweeps trashed tasks older than `trashRetentionDays`
  (default 7, 0 = off) — configurable in Settings → Общие
- **Due time**: the task due field is now a `datetime-local` input (ISO
  `YYYY-MM-DDTHH:mm`); `tasks_list` notifies assignees when a task is due
  within `dueSoonNotifyMinutes` (default 60, 0 = off), deduped per task
- **Open log folder**: «Настройки → Общие → Диагностика» button +
  `openLogFolder` command (tauri-plugin-opener) for the machine-local logs
- **Notes category badge**: the article title shows «Категория: …»
- **Audit coverage**: `task.create`/`task.edit`/`task.delete`/`task.status`
  and `article.create`/`article.edit`/`article.delete` are now recorded;
  the audit tab resolves `u:<uuid>` to the user's display name and shows
  «Система» for system actors

### Fixed

- Collapsed-sidebar user menu is rendered with `position: fixed`, so it is no
  longer clipped by the sidebar in icon-only mode

### Changed

- Version bumped to `0.9.5`

## [0.9.4] - 2026-10-24

### Added

- **Audit log UI**: new «Журнал аудита» tab in the admin panel (`audit.view`)
  with a data table (Время / Пользователь / Действие / Сущность / Детали),
  filters by user login, exact action, and date (`YYYY-MM-DD`), and
  pagination; backend `auditGetLogs` reads the monthly JSONL files
- **Per-user session lifetime**: `users.json` gains `sessionLifetimeDays`
  (null = workspace default, 0 = never); the admin Users tab has a
  «Время жизни сессии» dropdown («По умолчанию», «Бессрочно», 1/7/30 дней)
  saved via `usersUpdate`; `authLoginRemember` and sessions prefer the
  per-user override
- **Import settings**: `config.json > autoCreateCategoryOnImport` (default
  true) toggled from «Настройки → Общие»; when enabled, imported `.md`/`.pdf`
  files get the category named after their source folder
- **Image editor UX**: clicking an image in the note preview opens a floating
  inline toolbar positioned directly above the image — S (300px), M (500px),
  L (100%), Слева/Центр/Справа (writes `width`/`style` into the Markdown)
- **Security documentation**: «Безопасность и шифрование» section in
  `docs/data-layout.md` and the README (plain-text storage rationale, no
  encryption, forgeable logs, planned digital signatures)

### Changed

- Version bumped to `0.9.4`

## [0.9.3] - 2026-10-24

### Added

- **Admin session lifetime** («Настройки → Общие», requires `workspace.settings`):
  config.json `sessionLifetimeDays` (default 30, 0 = never). Remember-me tokens
  now embed `expiresAt` (`userId.hash.expiresAt`, covered by the HMAC);
  `authAutoLogin` rejects expired tokens with `TOKEN_EXPIRED`, and an open
  session that outlives the lifetime is cleared on the next API call (graceful
  re-login). Existing 0.9.2 tokens are invalidated once
- **Collapsible sidebar**: ☰ toggle near the logo persists in localStorage;
  collapsed mode is a 64px icon rail (text labels and section headers hidden,
  items centered) with `title` tooltips on every item; the space switcher and
  user card adapt (folder icon / avatar only)

### Changed

- Version bumped to `0.9.3`

## [0.9.2] - 2026-10-24

### Fixed

- **Remember me now actually works**: on startup the boot probe went through
  the global error handler, which navigates to `/login` on `AUTH_REQUIRED` —
  that raced the auto-login and stranded the user on the login screen despite
  a valid token. The boot path now uses quiet auth probes
  (`refreshSessionQuiet`/`autoLoginQuiet`) that never navigate; the token is
  cleared only when the backend rejects it (`TOKEN_INVALID`/`AUTH_FAILED`),
  not on transient IO errors
- `authLoginRemember` only saves the token when a new token was actually
  issued (a failed request no longer wipes an existing valid token)
- GitHub `main` synced: the rewritten README (0.9.1/0.9.2, plugin architecture,
  stages) is now on `main` and pushed (it previously lived only on the stage
  branch, so GitHub still showed the v0.8.4 README)
- Diagnostics: `tracing` logs in `authLoginRemember`/`authAutoLogin` (token
  generation, receipt, HMAC-mismatch / disabled-account failures) and
  `console.log` diagnostics in the login and boot flows

### Changed

- Version bumped to `0.9.2`

## [0.9.1] - 2026-10-24

### Added

- **Remember me**: «Запомнить меня на этом компьютере» checkbox on the login
  screen. `authLoginRemember` issues a machine-local token (HMAC of userId +
  passwordHash, keyed by the per-machine id) stored in the Tauri store — never
  in the SMB workspace. On startup the app tries `authAutoLogin` before
  redirecting to the login screen and clears the token on failure
- **Extension system master toggle**: «Настройки → Расширения» with the master
  switch «Включить систему расширений» (OFF by default) and per-plugin ON/OFF
  toggles. State is stored in the workspace `config.json`
  (`pluginsEnabledByDefault`, `pluginsEnabled`, `pluginsState`), backfilled for
  existing workspaces. When the system is off, the «Расширения» menu item and
  all plugin UI (sidebar/topbar/floating) are hidden
- **Settings → Общие** tab: app version, workspace path (read-only), and
  «Очистить кэш» (clears app localStorage)
- Profile email editing was already available («Профиль» tab)

### Changed

- `main` branch merged with all pending hotfixes (v0.8.5 → v0.9.0); README
  rewritten (version badge 0.9.1, plugin architecture, project stages,
  clear dev instructions)
- Version bumped to `0.9.1`

## [0.9.0] - 2026-10-24

### Fixed

- AI-assistant plugin buttons finally work in release builds: in WebView2
  production `localStorage` inside the plugin iframe throws a `SecurityError`,
  which halted the whole script before `addEventListener` ran. The plugin now
  accesses storage through `safeGetStorage`/`safeSetStorage` wrappers (try/
  catch), so the script always finishes attaching its handlers even when
  storage is blocked
- The plugin reports runtime errors to the host via `plugin:error`; the bridge
  in `PluginFrame` logs them and shows an error toast for diagnostics
- Plugin iframe is back on a `blob:` URL with
  `sandbox="allow-scripts allow-same-origin allow-forms"` (behaves better with
  WebView2 than `srcDoc`)
- Bundled `llm-assistant` plugin bumped to 1.1.0 so installed workspaces pick
  up the fix

### Changed

- Version bumped to `0.9.0`

## [0.8.9] - 2026-10-24

### Changed

- Patch release 0.8.9: rebuild of the 0.8.8 line (unsandboxed plugin iframe +
  disabled CSP) published under a fresh tag so the release pipeline ships the
  final fix. (Requested as `0.8.8.1`, but Tauri requires strict semver, so the
  patch version is `0.8.9`.)

## [0.8.8] - 2026-10-24

### Fixed

- AI-assistant plugin buttons now work in production builds: the WebView2
  `sandbox` attribute blocked the plugin's JavaScript, so the plugin iframe is
  unsandboxed (local, trusted plugin content rendered via `srcdoc`) and the
  postMessage bridge keeps the `event.source` check as the only gate
- CSP is fully disabled (`"csp": null` in `tauri.conf.json`) to eliminate all
  WebView2 inline-script/frame blocking for the local desktop app
- The bundled plugin already binds every button with `addEventListener`
  (no inline `onclick=` handlers), so it needed no HTML changes

### Changed

- Version bumped to `0.8.8`

## [0.8.7] - 2026-10-24

### Fixed

- F5/reload no longer kicks the user to the login screen: the app restores the
  still-alive Rust session via `authRefreshSession` before redirecting to
  `/login`
- «Новая статья» category dropdown now loads the real category list from the
  backend (`notesListCategories`) instead of only the categories of loaded notes
- Attachments support any file type: the markdown editor's «Прикрепить файл»
  picks any file (no image-only filter), the Rust `attachmentAdd` accepts any
  extension, and the renderer shows an inline image for images or a clickable
  `📄 filename` link (opens with the OS app) for documents/archives/executables
- Panels no longer close accidentally: the task panel backdrop and the plugin
  modal backdrop no longer dismiss on click — only the explicit ✕ / «Свернуть»
  buttons close them

### Changed

- Version bumped to `0.8.7`

## [0.8.6] - 2026-10-24

### Fixed

- Plugin white screen (definitive): the `plugin://` custom protocol is unreliable inside a sandboxed WebView2 iframe, so plugins are rendered again from their entry HTML via `srcdoc` with `allow-scripts allow-same-origin allow-forms`; the CSP is permissive for iframes (`script-src * 'unsafe-inline'`, `style-src * 'unsafe-inline'`, `frame-src 'self' data: blob:`) and the postMessage bridge accepts the app origin (srcdoc inherits it) plus null/plugin origins
- Analytics charts animate again: `isAnimationActive` is explicit on the Pie and Bar recharts components

### Added

- Task deletion: «Удалить задачу» button in the task panel header (visible with `task.delete`), a confirmation dialog, and a task-list refresh after deletion
- Checklist items can now be edited inline (saved on blur/Enter via `tasksUpdate`) and deleted with the ✕ button

### Changed

- Version bumped to `0.8.6`

## [0.8.5] - 2026-10-24

### Fixed

- Plugin white screen on Windows: the iframe now loads `plugin://localhost/<pluginId>/index.html`, and the CSP also allows `http://plugin.localhost` (the WebView2 rewrite of the custom scheme), so scripts/styles/frames are no longer blocked in release builds
- Plugin assets now use `application/javascript` for `.js`/`.mjs` files; the `plugin://` route parsing is covered by Rust tests for all platform URL forms
- Analytics widget disappearing after tab switches: charts get a stable `ResponsiveContainer` (`height={300}`, `minWidth={200}`), the widget box has `min-height`/`min-width`, and cached tasks from the task store are reused on remount instead of refetching

### Changed

- Version bumped to `0.8.5`

## [0.8.4] - 2026-10-23

### Fixed

- Plugin white screen in release builds: plugins are now served from a native Tauri custom protocol (`plugin://<id>/index.html`) instead of `srcdoc`/Blob URLs, giving the iframe a real origin for scripts, styles and `localStorage`
- SMB freezes: removed the `notify` file watcher (it can hang on network drives); the UI relies on the existing 30 s polling
- Cleaned up all dead-code warnings by moving test-only `*_impl` helpers behind `#[cfg(test)]`

### Changed

- CSP allows `plugin:` frames/assets; the postMessage bridge also validates the plugin origin

## [0.8.3] - 2026-10-23

### Fixed

- Plugin iframe in release builds: CSP now allows `blob:` frames (`frame-src 'self' blob: data:`); plugins are rendered from a Blob URL instead of `srcdoc`
- SMB responsiveness: task/note/dashboard/spaces/notification reads and workspace activation (migration, backfill, bundled-plugin install) now run on blocking threads; the watcher debounce is 1000 ms

### Changed

- 30 s polling skips ticks while a previous request is still in flight

## [0.8.2] - 2026-10-23

### Fixed

- The bundled AI Assistant plugin is now installed/updated automatically in `{workspace}/plugins/` on workspace activation, so app updates replace stale plugin files (the previous hotfix did not update the workspace copy)
- Plugin iframe now loads via a Blob URL instead of `srcdoc`, and the CSP allows inline scripts/styles inside it — buttons and the theme toggle work in the compiled app

### Changed

- `llm-assistant` moved to `src-tauri/resources/plugins/` and shipped as a bundle resource

## [0.8.1] - 2026-10-23

### Fixed

- Plugin CSP in production builds: inline plugin scripts/styles and the `srcdoc` iframe are now allowed (`script-src 'unsafe-inline'`), restoring the LLM Assistant buttons and theme toggle
- Release-build responsiveness: watcher debounce raised to 700 ms so SMB event bursts no longer trigger refetch storms; 30 s polls skip when a request is still in flight
- LLM bridge diagnostics: request timeouts and failures are logged to the console

### Changed

- CSP `connect-src` allows local Ollama (`127.0.0.1` / `localhost:11434`) and OpenRouter/OpenAI endpoints

## [0.8.0] - 2026-10-23

### Added

- Plugin Architecture: drop-in plugins in `{workspace}/plugins/` with `manifest.json` and a sandboxed iframe (`srcdoc`), listed on the «Расширения» page
- Bidirectional `postMessage` bridge: plugins can read tasks/notes and create notes, tasks, and KB categories (whitelisted actions, backend RBAC enforced)
- Plugin UI injection (`ui.inject`: sidebar / topbar / floating) with a modal that stays mounted while minimized
- LLM Assistant plugin (`plugins/llm-assistant`): chat history, Markdown, theme support, OpenRouter and local Ollama providers, model search, and `create_notes` / `create_tasks` / `create_category` actions
- Async Rust backend: network/file commands run off the async runtime (`spawn_blocking`), fixing UI freezes during heavy SMB/network load
- In-flight guards for 30 s polling and `#[tracing::instrument]` on heavy commands

### Fixed

- Encoding regression in the workspace layout (restored UTF-8)
- Ollama connectivity: IPv4 `127.0.0.1`, proxy bypass (`no_proxy`), 300 s timeout, detailed reqwest error logging
- LLM modal no longer unmounts/cancels generation on outside click (minimizes with a busy indicator)

### Security

- Plugin iframe sandbox (`allow-scripts allow-same-origin`), action whitelist, and `INVALID_ASSIGNEE` space-membership validation

## [0.7.0] - 2026-10-22

### Added

- Global search / command palette (Ctrl/Cmd+K) for tasks and notes across accessible spaces, with recent items
- In-app notifications: bell with unread dot, task assignment / comment mention / space added events, 30 s polling and instant file-watcher refresh
- Auto-updater: online GitHub Releases channel (signed artifacts) and offline `updates/update.json` detection + «Установить и перезапустить»
- Dashboard analytics widget: tasks-by-status pie and per-assignee workload bar (recharts)
- Loading skeletons for the task board, knowledge base, and dashboard
- GitHub Actions release workflow with manual dispatch, updater artifact signing and `latest.json`

### Fixed

- Space isolation for assignees: only space members can be assigned (`INVALID_ASSIGNEE`), and the picker lists space members only
- `@login` mentions now trigger notifications, with a space-member autocomplete in the comment box
- Real-time sync across spaces: the task watcher matches `spaces/{spaceId}/tasks/`; notifications react to `notifications/{userId}.json`
- 30 s polling fallback for task boards and the dashboard when SMB file events are dropped

### Security

- Passwordless updater signing key; CI uses only `TAURI_SIGNING_PRIVATE_KEY`

## [0.6.0] - 2026-10-22

### Added

- Spaces (personal & shared) with a space switcher and per-space data isolation
- Personal spaces (`personal_{userId}`) with full owner rights regardless of global role
- Cross-space collaboration: task transfer between spaces and note sharing
- Per-space knowledge base categories (`spaces/{spaceId}/categories.json`)
- Space-scoped permissions (`space.manage`), admin permission backfill, and safe folder switching

### Fixed

- Calendar drag-and-drop to/from the "Без срока" sidebar, including geometric overlap between the scrollable grid and the sidebar

### Security

- Documented the security model: in-app RBAC protects against accidents; configure NTFS ACLs on the SMB share for real access control

## [0.5.0] - 2026-10-21

### Added

- Customizable dashboard with drag-and-drop widgets
- Calendar view with drag-and-drop due dates
- User avatars (image upload & caching)
- Markdown image resizing (S/M/L)
- MD/PDF note import
- Extended settings (theme, kanban visibility, security tabs)

## [0.4.0] - 2026-10-19

### Added

- Knowledge Base with explicit category management
- Markdown article editor with version history and snapshots
- Optimistic locking (VERSION_CONFLICT) and draft protection for articles
- Content-addressable attachments (SHA-256 deduplication)
- Image embedding and system-level file opening (tauri-plugin-opener)
- Read/Edit modes for Task and Article panels

## [0.3.0] - 2026-10-19

### Added

- Kanban board with Drag-and-Drop
- Task detail panel with Markdown editor, checklists, and comments
- Optimistic locking (VERSION_CONFLICT) and draft preservation
- Real-time workspace updates via filesystem watcher
- Task filtering (search, priority, assignee) and List view

## [0.2.0] - 2026-10-18

### Added

- Authentication and in-memory sessions
- Roles and editable permission matrix
- Admin panel (users, roles)
- Profile screen with forced password change
- Workspace schema v1 → v2 migration

### Changed

- UserInfo DTO: dropped passwordSalt; passwordHash never leaves Rust

### Security

- Audit log: auth.login_failed stores loginHash, not plaintext login

## [0.1.0] - 2026-10-15

### Added

- Tauri 2 + React 18 + TypeScript + Vite application shell
- SMB-safe storage primitives: atomic writes, exclusive creates, locks, watcher, hashing
- Workspace init / validate / activate and folder inspection
- Argon2id password hashing (PHC) and admin onboarding
- Monthly audit log and immutable event journal via tracing
