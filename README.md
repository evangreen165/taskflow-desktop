# TaskFlow — Desktop Task Tracker & Knowledge Base

![Version](https://img.shields.io/badge/version-0.9.1-blue)

## Overview

TaskFlow is a serverless desktop application designed for small teams. It combines a Kanban task tracker with a Markdown knowledge base. It operates directly on a shared network folder (SMB) without a centralized server, using local JSON and Markdown files for storage.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Zustand (state), React Router, dnd-kit, react-grid-layout, react-markdown, recharts.
- **Backend:** Rust (Tauri 2).
- **Storage:** Plain JSON, Markdown, and binary files (attachments) on the file system. Content-addressable storage (SHA-256) for attachments.
- **Machine-local state:** `tauri-plugin-store` for per-machine data (saved workspace path, "remember me" token) — never synced via SMB.

## Architecture & Security

- **No HTTP Server:** The app uses Tauri IPC for communication between React and Rust.
- **Authentication:** Argon2id password hashing. In-memory sessions, optional machine-local "remember me" token (HMAC-bound to the user's password hash).
- **Permissions:** Role-Based Access Control (RBAC) enforced strictly in the Rust backend.
- **Concurrency:** Optimistic locking (version numbers) for all write operations to prevent data loss over the network.
- **Watchers:** Real-time filesystem watchers to sync changes between multiple users via SMB.

## Plugin Architecture

Plugins are self-contained HTML files bundled with the app (`src-tauri/resources/plugins/`) and installed into every workspace's `plugins/` folder:

- **LLM Assistant (`llm-assistant`):** the built-in AI assistant. It runs its UI inside a sandboxed `<iframe>` that loads the plugin's entry HTML from a `blob:` URL (`allow-scripts allow-same-origin allow-forms`).
- **Iframe bridge:** the plugin talks to TaskFlow over `window.postMessage`. Requests (`taskflow:request`) are accepted only when `event.source` matches the plugin iframe; the host runs a whitelisted action (notes, tasks, LLM proxy, theme) and replies with `taskflow:response`. Runtime errors are reported via `plugin:error` and surface in an error toast.
- **Injection points:** plugins can inject UI into the sidebar, topbar, or as a floating button.
- **Master toggle:** the extension system is **off by default**. It is enabled from **Настройки → Расширения** (per workspace, stored in the workspace `config.json`). Individual plugins have their own ON/OFF toggles. When the system is off, the «Расширения» menu item and all floating plugin buttons are hidden.

## Security & Encryption

TaskFlow deliberately does **not** encrypt data on disk. All workspace files
(JSON, Markdown, attachments) are stored in plain text for:

- **Portability & transparency** — data can be read, moved, and backed up with
  any tool, without special utilities.
- **Crash recovery** — an open JSON/MD file can be repaired by hand; an
  encrypted file without its key would be unrecoverable.

Consequences to be aware of:

- Passwords are stored as Argon2id hashes, but the hash files sit on the shared
  folder — anyone with SMB access can copy `users/*.json` and attack the hashes
  offline. Protect the folder with NTFS ACLs.
- Audit logs and data files are **forgeable**: the app cannot distinguish an
  edit made through the UI from a manual edit in Notepad. Tamper-proofing via
  digital signatures on journal records is planned for a future release.
- The app's RBAC protects against **accidental** damage only; real access
  control is the OS file permission layer on the SMB share.

## Security Model & Limitations

TaskFlow's RBAC is enforced in the Rust backend and governs what the _application_
allows each role to do. It protects users from **accidental** damage: a regular
user cannot edit someone else's tasks, and a space can only be managed by its
owner or a role with the `space.manage` permission.

These checks are **not** a real security boundary. Every workspace is a plain
folder with JSON and Markdown files, and any Windows user who has filesystem
access to the SMB share can open them in Notepad, edit them, or copy them
elsewhere — completely bypassing the app.

To protect the data for real:

- Configure **NTFS ACLs** on the shared folder (and the share itself) so only
  intended users can read or write it.
- Keep user accounts on the Windows machine separate from the SMB credentials;
  in-app roles are UI-level conveniences, not access control.
- Passwords are stored as Argon2id hashes, but the hash files sit on the same
  disk — treat the workspace folder as sensitive data.

In short: **the app protects against accidents; the OS file permissions protect
against unauthorized access.**

## Development Workflow

- Every stage or step gets a detailed report in `docs/reports/`; the chat
  summary is intentionally brief. See `.ai/INSTRUCTIONS.md` for the rule.
- Stage commits use `stage<N>(<step>): ...`.
- Before committing, run `cargo test` (in `src-tauri/`), `npm run test`,
  `npm run lint`, and `npm run build`.

## Project Stages (History)

- **v0.1.0 (Foundation):** Basic Tauri skeleton, workspace initialization, atomic file operations, secure path resolution.
- **v0.2.0 (Auth & Permissions):** User management, editable roles matrix, RBAC, audit logging, v1->v2 workspace migration.
- **v0.3.0 (Task Tracker):** Kanban board with Drag-and-Drop, task details panel, Markdown descriptions, comments, checklists, VERSION_CONFLICT resolution, real-time sync.
- **v0.4.0 (Knowledge Base):** Markdown article editor, version history (snapshots), explicit categories, image/file attachments, read/edit modes.
- **v0.5.0 (Dashboard & Calendar):** Customizable dashboard grid, calendar view with drag-and-drop due dates, profile settings, avatars.
- **v0.6.0 (Spaces & Search):** Spaces with personal/shared ownership, global search, notifications, audit browser.
- **v0.7.0 (Dashboard & Updater):** Analytics widgets, dashboard customization, online/offline updater with `latest.json`.
- **v0.8.0 (Plugins & Async):** Plugin system with iframe bridge, async task store, sessions, custom protocols, release pipeline.
- **v0.9.0 (Polish):** Auth security (remember me), plugin management (master toggle), settings expansion, GitHub sync.

## How to Run Locally (Development)

### Prerequisites

- Node.js (v18+)
- Rust (stable toolchain)
- OS-specific dependencies for Tauri (e.g., MSVC Build Tools on Windows, WebKit2Gtk on Linux).

### Setup & Run

```bash
# 1. Clone the repository
git clone https://github.com/evangreen165/taskflow-desktop.git
cd taskflow-desktop

# 2. Install frontend dependencies
npm install

# 3. Run the app in development mode (starts Vite + builds Rust debug binary)
npm run tauri dev
```

Notes:

- The first `tauri dev` compiles the Rust backend, which takes a few minutes.
- Keep `npm run tauri dev` running; it hot-reloads the frontend and restarts
  the Rust side on change.
- On first launch you will be asked to create or open a workspace folder and
  set up the administrator account.

## How to Build for Production

```bash
npm run tauri build
```

The executable and installers (`.msi`) will be located in `src-tauri/target/release/bundle/`.

## Workspace Data Layout

When the user creates a workspace, the following structure is initialized in the chosen folder:

- `config.json`: Workspace metadata, schema version, and plugin settings.
- `users/`: User profiles and hashed credentials.
- `roles/`: Role definitions and permission matrices.
- `tasks/`: One JSON file per task.
- `notes/`: One folder per note (containing `meta.json` and `note.md`).
- `attachments/`: Content-addressed binary files (named by their SHA-256 hash).
- `audit/`: Append-only JSONL audit logs.
- `events/`: Append-only system events (e.g., migrations).
- `plugins/`: Installed plugins (entry HTML + manifest).
