# Changelog

All notable changes to TaskFlow are documented in this file.

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
