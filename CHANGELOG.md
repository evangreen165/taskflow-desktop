# Changelog

All notable changes to TaskFlow are documented in this file.

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
