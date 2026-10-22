# Stage 7.3b — Offline Installation, CI Pipeline & Sync Polling

- **Status:** implemented, gates green
- **Branch:** `stage7/notifications`
- **Commit:** `stage7(3b): offline installation, CI pipeline & sync polling`

## Task 1 — Offline update execution

`src-tauri/src/commands/updater.rs` gained `installOfflineUpdate(path)`.

### Validation (`install_offline_update_impl` / `resolve_installer`)

- Relative paths resolve against the workspace root; absolute paths are
  canonicalized.
- The installer must live **inside `{workspace}/updates/`** → otherwise
  `FORBIDDEN`.
- Extension must be `.exe` or `.msi` (case-insensitive) → otherwise
  `INVALID_INPUT`.
- Missing files → `NOT_FOUND`.
- This prevents the renderer from launching arbitrary executables.

### Execution

- `.exe` → `std::process::Command::new(installer).spawn()`.
- `.msi` (Windows) → `msiexec /i <installer>`.
- The command then calls `std::process::exit(0)` immediately so the running
  app releases its files for the installer.

### UI

`/app/settings` → **О программе** → offline update card now shows
**«Установить и перезапустить»** (only when the manifest has a `path`). Errors
from validation are shown as a toast; on success the app exits.

### Tests

Resolves `.exe`/`.msi` inside `updates/`; rejects wrong extension, an absolute
path outside `updates/`, a missing file, and `../` traversal.

## Task 2 — GitHub Actions release pipeline

`.github/workflows/release.yml`:

- Trigger: push of a `v*` tag.
- `windows-latest`, `contents: write`.
- Steps: checkout, Node 20 (npm cache), Rust stable, Rust cache (`src-tauri`),
  `npm ci`.
- `tauri-apps/tauri-action@v0` runs the Tauri build (equivalent to
  `npm run tauri build`), signs updater artifacts and creates the GitHub
  Release with the MSI, NSIS `.exe`, `.sig` files and `latest.json`
  (`includeUpdaterJson: true`).
- Signing secrets wired through env:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `GITHUB_TOKEN` is used to create the release.

`.gitignore` now ignores `*.key` so the generated private key cannot be
committed accidentally.

## Task 3 — Robust multi-user sync (polling fallback)

- `useTaskStore` gained `fetchTasksSilently(spaceId)` — refreshes the task list
  without toggling `loading`.
- `TasksPage` starts a 30 s `setInterval` that calls it, so changes from another
  PC appear even if the SMB watcher drops events. The existing
  `workspace://fs-event` watcher still provides instant updates when it works.
- `DashboardPage` now refreshes its summary every 30 s silently
  (`load(true)` skips the loading state), covering cross-space widgets.
- Notifications already poll every 30 s and additionally react to the watcher
  (Stage 7.3).

## Task 4 — Documentation

Added `docs/RELEASE_PROCESS.md`:

- one-time signing-key setup and CI secrets;
- version bump + changelog + tag/push steps;
- what the GitHub Actions workflow builds and uploads;
- how online and offline updates reach users;
- multi-user sync notes and troubleshooting.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **154 passed**, 0 failed                              |
| `npm run test`  | **115 passed** (24 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/updater.rs        (installOfflineUpdate + tests)
src-tauri/src/lib.rs                     (handler)
src/stores/useTaskStore.ts               (fetchTasksSilently)
src/pages/tasks/TasksPage.tsx            (30 s poll)
src/pages/dashboard/DashboardPage.tsx    (30 s silent refresh)
src/services/updater.ts                  (installOffline)
src/services/updater.test.ts             (test)
src/pages/settings/SettingsPage.tsx      (install button)
.github/workflows/release.yml            (new)
.gitignore                               (*.key)
docs/RELEASE_PROCESS.md                  (new)
docs/reports/stage7-3b-updater-cicd.md   (this report)
```

## Known limitations / follow-ups

- The offline installer runs elevated only if the installer itself requests it;
  no extra UAC handling is added.
- `std::process::exit(0)` is immediate after spawning; a slow installer start
  could race with file locks. Using a detached helper is a possible hardening.
- The release workflow builds Windows artifacts only (`x86_64-pc-windows-msvc`);
  macOS/Linux targets would need additional jobs.
- The public key in `tauri.conf.json` must match the CI private key; regenerating
  one without the other breaks online updates.
