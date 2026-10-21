# TaskFlow — Desktop Task Tracker & Knowledge Base

## Overview

TaskFlow is a serverless desktop application designed for small teams. It combines a Kanban task tracker with a Markdown knowledge base. It operates directly on a shared network folder (SMB) without a centralized server, using local JSON and Markdown files for storage.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Zustand (state), React Router, dnd-kit, react-grid-layout, react-markdown.
- **Backend:** Rust (Tauri 2).
- **Storage:** Plain JSON, Markdown, and binary files (attachments) on the file system. Content-addressable storage (SHA-256) for attachments.

## Architecture & Security

- **No HTTP Server:** The app uses Tauri IPC for communication between React and Rust.
- **Authentication:** Argon2id password hashing. In-memory sessions.
- **Permissions:** Role-Based Access Control (RBAC) enforced strictly in the Rust backend.
- **Concurrency:** Optimistic locking (version numbers) for all write operations to prevent data loss over the network.
- **Watchers:** Real-time filesystem watchers to sync changes between multiple users via SMB.

## Project Stages (History)

- **v0.1.0 (Foundation):** Basic Tauri skeleton, workspace initialization, atomic file operations, secure path resolution.
- **v0.2.0 (Auth & Permissions):** User management, editable roles matrix, RBAC, audit logging, v1->v2 workspace migration.
- **v0.3.0 (Task Tracker):** Kanban board with Drag-and-Drop, task details panel, Markdown descriptions, comments, checklists, VERSION_CONFLICT resolution, real-time sync.
- **v0.4.0 (Knowledge Base):** Markdown article editor, version history (snapshots), explicit categories, image/file attachments, read/edit modes.
- **v0.5.0 (Dashboard & Calendar):** Customizable dashboard grid, calendar view with drag-and-drop due dates, profile settings, avatars.

## How to Run Locally (Development)

### Prerequisites

- Node.js (v18+)
- Rust (stable toolchain)
- OS-specific dependencies for Tauri (e.g., MSVC Build Tools on Windows, WebKit2Gtk on Linux).

### Setup

1. Clone the repository.
2. Install dependencies: `npm install`
3. Run in development mode: `npm run tauri dev`

## How to Build for Production

- Build the application: `npm run tauri build`
- The executable and installers (.msi) will be located in `src-tauri/target/release/bundle/`.

## Workspace Data Layout

When the user creates a workspace, the following structure is initialized in the chosen folder:

- `config.json`: Workspace metadata and schema version.
- `users/`: User profiles and hashed credentials.
- `roles/`: Role definitions and permission matrices.
- `tasks/`: One JSON file per task.
- `notes/`: One folder per note (containing `meta.json` and `note.md`).
- `attachments/`: Content-addressed binary files (named by their SHA-256 hash).
- `audit/`: Append-only JSONL audit logs.
- `events/`: Append-only system events (e.g., migrations).
