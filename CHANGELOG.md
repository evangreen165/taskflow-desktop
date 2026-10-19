# Changelog

All notable changes to TaskFlow are documented in this file.

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
