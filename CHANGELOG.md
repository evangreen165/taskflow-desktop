# Changelog

All notable changes to TaskFlow are documented in this file.

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
