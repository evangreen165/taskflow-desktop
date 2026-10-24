# Stage 9.2 — Remember Me Fix & GitHub main Sync (v0.9.2)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `hotfix/v0.9.2` (from `main`)
- **Commit:** `stage9(2): fix remember me & github readme sync`

## Bug 1 — GitHub README not updated

Root cause: the rewritten README (and the whole stage9(1) content) lived only
on `stage9/auth-plugins-settings`; `main`/`origin/main` were still at v0.8.4
content. The v0.9.1 tag pointed at the stage branch, so GitHub's `main` never
received the README.

Fix:
- `git merge stage9/auth-plugins-settings` on `main` (fast-forward
  `0f308b0..e669af1`) — brings the README **and** the v0.9.1 code it describes.
- Verified ahead of `origin/main`: `git rev-parse HEAD` → `e669af1`,
  `origin/main` → `0f308b0` (before push), then `git push origin main`.
- Now `main` = `e669af1` on GitHub, README shows 0.9.1/0.9.2 content.

## Bug 2 — «Запомнить меня» does not auto-login

Traced the failure point end-to-end.

**Root cause (frontend boot race):** `invokeCommand` routes every failure
through `reportAppError`, whose `AUTH_REQUIRED` branch calls
`appNavigate("/login")`. On app restart, `resolvePhase` first probes the
session (`authRefreshSession` → `AUTH_REQUIRED`) — and that navigation to
`/login` **raced the auto-login**: the router moved to `/login`, `BootGate`
(only mounted at `/`) unmounted, and even though `authAutoLogin` then succeeded
and set the session, nothing could redirect back into the app. The user saw the
login screen.

**Fix:**
- `src/lib/invoke.ts`: new `invokeQuiet()` (same typed `Result` wrapper, **no**
  `reportAppError`).
- `src/services/auth.ts`: `refreshSessionQuiet()` / `autoLoginQuiet()`.
- `src/stores/useAppStore.ts` `resolvePhase`: uses the quiet probes, logs the
  token, and **clears the token only on `TOKEN_INVALID`/`AUTH_FAILED`** —
  transient IO errors no longer destroy a valid token.
- `src/pages/auth/LoginScreen.tsx`: logs the checkbox state and saves the token
  **only when `authLoginRemember` actually issued one** (a failed request no
  longer wipes an existing token).
- Capabilities verified: `src-tauri/capabilities/default.json` contains
  `store:default` (remember token + workspace path live in the machine-local
  Tauri store, `app-config.json`). There is no `tauri-plugin-http` in this app
  (HTTP goes through Rust `reqwest`), so nothing to add there.

## Diagnostics added

- Rust (`commands/auth.rs`): `tracing::info!` in `remember_token_impl`
  («Generated remember-me token: …») and in `auto_login_impl` («Auto-login
  token received: …», «auto-login OK, restoring session», plus `warn!` for
  user-not-found / disabled-account / HMAC-mismatch).
- Frontend: `console.log` in the login submit («Saving token: …») and boot
  (`[boot] AutoLogin token: …`, `[boot] auto-login OK/ failed`).

### Exact tracing logs captured locally (`cargo test remember_flow_logs_trace -- --nocapture`)

```
INFO taskflow_lib::commands::auth: Generated remember-me token:
  Y2ZmZTMxMTktN2UyYy00NGVlLTgxYTUtN2EzNTdhMTQ3MGZi.
  d9634f790313ce11dfa1ef159c2a4c61c5399c782ad2b9b91bfb0af28e9b66c4
  user_id=cffe3119-7e2c-44ee-81a5-7a357a1470fb
INFO taskflow_lib::commands::auth: Auto-login token received:
  Y2ZmZTMxMTktN2UyYy00NGVlLTgxYTUtN2EzNTdhMTQ3MGZi.
  d9634f790313ce11dfa1ef159c2a4c61c5399c782ad2b9b91bfb0af28e9b66c4
INFO taskflow_lib::commands::auth: auto-login OK, restoring session
  user_id=cffe3119-7e2c-44ee-81a5-7a357a1470fb
```

Failure-path messages produced by the code (visible in the app log file):
`auto-login failed: HMAC mismatch (stale token or wrong machine)`,
`auto-login failed: account is disabled`, `auto-login failed: user not found`.

Frontend console logs (in the running app, this environment cannot launch the
GUI): `[boot] AutoLogin token: <token>`, `[boot] auto-login OK: <login>` on
success, `[boot] auto-login failed: TOKEN_INVALID — invalid remember token`
otherwise, and `Saving token: <token>` after login with the checkbox checked.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **168 passed** (+1 trace-capture test) |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.2                      |

## Release

- Commit: `stage9(2): fix remember me & github readme sync`
- Tag `v0.9.2` pushed to GitHub (triggers the release workflow).
- `main` was already pushed and verified ahead of `origin/main`.

## Notes

- The GUI-level `console.log` lines above could not be produced here (no GUI in
  this environment); the Rust-side tracing lines above are the exact captured
  output from the test run.
