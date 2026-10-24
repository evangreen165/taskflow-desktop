# Stage 9.1 — GitHub Sync, Remember Me, Plugin Master Toggle & Settings (v0.9.1)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/auth-plugins-settings` (from `main`)
- **Commit:** `stage9(1): github sync, remember me, plugin master toggle & settings`

## Part 1 — GitHub cleanup & sync

- Merged the entire pending hotfix chain (v0.8.5 → v0.9.0) into `main`
  (fast-forward; the hotfix branches were sequential, so one merge brings
  everything) and pushed `main` + all tags to GitHub.
- `README.md` rewritten:
  - version badge → **0.9.1** (the release this stage ships; the request said
    0.9.0, but the stage bumps to 0.9.1);
  - new **Plugin Architecture** section (LLM Assistant, iframe bridge,
    injection points, master toggle);
  - **Project Stages** updated to include Stage 7 (Dashboard/Updater),
    Stage 8 (Plugins/Async), Stage 9 (Polish);
  - crystal-clear `npm run tauri dev` instructions.

## Part 2 — «Remember Me» (session persistence)

- **Backend** (`commands/auth.rs`):
  - `authLoginRemember(login, password)` — verifies credentials (same as
    `authLogin`) and returns a machine-local token
    `{base64url(userId)}.{hex(HMAC-SHA256(machineId, "userId:passwordHash"))}`;
    the per-machine id (from `identity.rs`) is the HMAC key, so a token is
    only valid on the issuing machine and is invalidated by a password change.
  - `authAutoLogin(token)` — validates the token (constant HMAC check against
    the stored user), rejects inactive accounts, and restores the session via
    the shared `establish_session` helper (last-login touch + `auth.login`
    audit), exactly like a password login.
  - 3 new Rust tests (roundtrip, tampered/malformed/foreign tokens, and
    invalidation after password change).
- **Frontend**:
  - `ConfigService` gained `getRememberToken`/`setRememberToken` on the
    machine-local Tauri store (`app-config.json`) — never in the SMB workspace.
  - Login screen: «Запомнить меня на этом компьютере» checkbox; after a
    successful login the token is saved (or cleared if not issued).
  - Boot (`useAppStore.resolvePhase`): refresh session → if none, try
    `authAutoLogin` with the stored token → on success enter the workspace, on
    failure **clear the token** and show the login screen.

## Part 3 — Plugin master toggle (disabled by default)

- `workspace.rs`: `WorkspaceConfig` gained `pluginsEnabledByDefault`
  (`true`), `pluginsEnabled` (master switch, `false`), `pluginsState`
  (`{ "llm-assistant": false }`), all with serde defaults for old configs;
  helpers `plugin_settings`/`set_plugin_settings` + a `PluginSettings` DTO.
  New workspaces are seeded via `init`.
- `backfill.rs`: `ensure_plugin_settings` writes the fields into existing
  workspaces only when they are absent (idempotent; never overwrites user
  changes).
- New commands `pluginsGetSettings` / `pluginsSetSettings` (auth-gated).
- Frontend:
  - `usePluginStore` holds `extensionsEnabled` + `pluginStates` with
    `loadExtensions`, `setExtensionsEnabled`, `setPluginState` (optimistic,
    rolls back on failure).
  - Settings gained a **«Расширения»** tab: master toggle «Включить систему
    расширений» (OFF by default) and per-plugin ON/OFF switches shown only
    when the master is on.
  - `WorkspaceLayout`: «🧩 Расширения» sidebar item is hidden when the master
    is off; injected sidebar/topbar/floating plugin UI is filtered to plugins
    with `pluginStates[id] === true`.

## Part 4 — Settings expansion

- Settings gained an **«Общие»** tab: app version (from `package.json`),
  workspace path (read-only), and «Очистить кэш» (`localStorage.clear()`).
- Profile email editing was **already available** on «Профиль» (input +
  `UsersService.update` → `usersUpdate.email`) — verified, no change needed.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **167 passed** (+3 remember-me tests)  |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.1                      |

## Release

- Tag `v0.9.1` pushed to GitHub (triggers the release workflow).

## Notes

- The literal field name/value pairing in the request (`plugins_enabled_by_default:
  true` "meaning extensions are hidden/disabled") is contradictory; the master
  toggle behavior (OFF by default) is implemented via `pluginsEnabled: false`,
  with `pluginsEnabledByDefault: true` stored as requested for new and
  backfilled workspaces.
- README badge uses 0.9.1 (the actual release version of this stage).
- No other bugs were touched in this stage.
