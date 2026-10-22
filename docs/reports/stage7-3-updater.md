# Stage 7.3 — Real-time Sync & Auto-Updater

- **Status:** implemented, gates green
- **Branch:** `stage7/notifications`
- **Commit:** `stage7(3): real-time sync & auto-updater`

## Task 1 — Real-time sync (watcher)

### Backend (verified, no code change needed)

The Rust watcher in `src-tauri/src/watcher.rs` already:

- watches the **workspace root recursively** (`RecursiveMode::Recursive`);
- is started by `AppState::ensure_watcher` with the root when no sub-path is
  given (`StorageService.startWatcher()` passes none);
- emits debounced batches on `workspace://fs-event` with workspace-relative
  paths;
- filters only our own atomic-write temp files and `locks/` churn, so
  `notifications/*.json` and `spaces/*/tasks/*.json` are emitted.

The problem was in the frontend filters, not the watcher.

### Frontend fixes

- `src/stores/taskWatcher.ts`: the board only matched the legacy `tasks/`
  prefix. It now matches the current space's
  `spaces/{currentSpaceId}/tasks/` (Stage 6 layout) and keeps legacy `tasks/`
  support. Cross-space task boards refresh again on external changes.
- `src/stores/useNotificationStore.ts`: added `setupNotificationWatcher()`,
  wired in `src/main.tsx`. It listens to `workspace://fs-event`; when the
  changed path is `notifications/{currentUserId}.json` it refetches after a
  150 ms debounce, bypassing the 30 s poll. This makes notifications from
  another PC/user appear immediately.

## Task 2 — Online auto-updater (Tauri 2)

### Dependencies & registration

- `@tauri-apps/plugin-updater` (npm, `^2.14.0`).
- `tauri-plugin-updater = "2"` (`Cargo.toml`).
- Registered in `lib.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())`.
- Capability `updater:default` added to `capabilities/default.json`.

### Signing key

Generated with `tauri signer generate`:

```
npx tauri signer generate --ci -p <password> -w <temp>\taskflow-updater.key -f
```

- **Public key** (committed in `tauri.conf.json`):
  `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDEwOTU2MDY3QUY2NzNGNUEKUldSYVAyZXZaMkNWRUEycUFldzJUUGR2amdiQkNUZllINkt3S0VIYXBJdWkzZDlHbm5TQjRFeG8K`
- **Private key + password** were written **outside the repository**
  (`C:\Users\user\AppData\Local\Temp\kilo\taskflow-updater.key` and
  `taskflow-updater-password.txt`). They must never be committed; move them to
  CI secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
  for real releases.

### Configuration (`src-tauri/tauri.conf.json`)

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "pubkey": "<generated public key>",
    "endpoints": [
      "https://github.com/evangreen165/taskflow-desktop/releases/latest/download/latest.json"
    ]
  }
}
```

The GitHub endpoint is a placeholder until the release pipeline publishes
`latest.json` + signed updater artifacts.

### UI

`/app/settings` → **О программе** → **Обновления**:

- "Проверить обновления" checks the **offline file first**, then the online
  endpoint.
- Online update: shows version + release notes and a **"Скачать и установить"**
  button (`downloadAndInstall`, with a download percentage).
- Errors (endpoint not published yet, offline dev build, network) are caught and
  shown without breaking the page; a toast announces a found update.

## Task 3 — Offline updater (manual file drop)

### Backend — `src-tauri/src/commands/updater.rs`

`checkOfflineUpdate` command:

- requires an authenticated session;
- reads `{workspace}/updates/update.json`;
- compares its `version` with `AppHandle::package_info().version`
  (`0.6.0`) using `major.minor.patch` (handles `v` prefix and
  `-prerelease`/`+build` suffixes);
- returns `{ version, notes, path }` only when the manifest version is strictly
  higher; missing/unparseable versions return `null`.

Manifest example:

```json
{
  "version": "0.7.0",
  "notes": "Stage 7 polish",
  "path": "updates/TaskFlow_0.7.0_x64-setup.exe"
}
```

The actual `.exe` replacement/install is intentionally **not** executed yet —
only detection and the UI notification.

### Tests (4)

Missing manifest, newer version returned, same/older ignored, version
comparison (`v0.7.0`, prerelease, unparseable).

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **152 passed**, 0 failed                              |
| `npm run test`  | **114 passed** (24 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/Cargo.toml                         (tauri-plugin-updater)
src-tauri/tauri.conf.json                    (updater config, artifacts)
src-tauri/capabilities/default.json          (updater:default)
src-tauri/src/lib.rs                         (plugin + handler)
src-tauri/src/commands/mod.rs                (updater module)
src-tauri/src/commands/updater.rs            (new: checkOfflineUpdate + tests)
src/stores/taskWatcher.ts                    (space-scoped path)
src/stores/useNotificationStore.ts           (fs-event watcher)
src/main.tsx                                 (watcher setup)
src/services/updater.ts                      (new)
src/services/updater.test.ts                 (new)
src/pages/settings/SettingsPage.tsx          (update UI)
src/pages/settings/SettingsPage.module.css
package.json / package-lock.json             (@tauri-apps/plugin-updater)
```

## Known limitations / follow-ups

- The GitHub updater endpoint and `latest.json` still need to be published, and
  release artifacts must be signed with the generated private key.
- Offline installation is not implemented; the command only detects and reports
  `updates/update.json`.
- `downloadAndInstall` installs the update; on platforms that do not restart
  automatically the UI asks the user to restart.
- Real-time sync relies on the SMB server forwarding change notifications to
  `notify`; if an SMB implementation drops events, the 30 s notification poll
  remains the fallback (task boards rely on the watcher).
- `notifications/{userId}.json` still uses read-modify-write without a per-user
  lock (carried over from 7.2).
