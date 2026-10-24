# Stage 9.3 — Admin Session Lifetime & Collapsible Sidebar (v0.9.3)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `stage9/settings-sidebar` (from `main`; `main` first merged
  `hotfix/v0.9.2` so the v0.9.2 remember-me fixes ride into this release)
- **Commit:** `stage9(3): admin session lifetime & collapsible sidebar`

## Part 1 — Admin session lifetime

Backend:
- `workspace.rs`: `WorkspaceConfig.sessionLifetimeDays` (serde default 30;
  0 = never), helpers `session_lifetime_days` / `set_session_lifetime_days` /
  `session_lifetime_window` (seconds). New workspaces seed 30.
- `session.rs`: `Session.expires_at` (unix seconds, `None` = never).
- `lib.rs` `require_auth`: an expired session is **cleared and reported as
  `AUTH_REQUIRED`**, so the next API call after the lifetime elapses (while the
  app stays open) gracefully logs the user out / prompts re-login.
- `commands/auth.rs`:
  - `establish_session` stamps `expires_at` from the workspace lifetime.
  - `authLoginRemember` token format is now
    `{base64url(userId)}.{hmac}.{expiresAtUnix}` where the HMAC covers
    `userId:passwordHash:expiresAt` (0 = never expire).
  - `authAutoLogin` parses all three parts, rejects expired tokens with the new
    `TOKEN_EXPIRED` code, then validates the HMAC / active account.
  - New tests: tampered/malformed/foreign/expired tokens + expired session
    clearing. Old 2-part 0.9.2 tokens are now `TOKEN_INVALID` (logged out once).
- `commands/workspace.rs`: `workspaceGetSessionLifetime` /
  `workspaceSetSessionLifetime` (the write requires `workspace.settings`).

Frontend:
- `errors.ts`/`errorMessages.ts`: `TOKEN_EXPIRED` registered with a message.
- `useAppStore.resolvePhase` also clears the token on `TOKEN_EXPIRED`.
- `WorkspaceService.getSessionLifetime` / `setSessionLifetime`.
- Settings «Общие»: admin-only (gated by `can("workspace.settings")`)
  «Время жизни сессии (дней)» number field (0 = бессрочно) with a save button.

## Part 2 — Collapsible sidebar (icons only)

`WorkspaceLayout.tsx` + `WorkspaceLayout.module.css`:
- ☰ toggle button at the top of the sidebar; state persisted in
  `localStorage` (`taskflow.sidebarCollapsed`) across reloads.
- Collapsed = 64px icon rail: `.logoText`, `.navLabel` (section headers) and
  `.itemText` (nav labels) hidden; `.navItem`/`.pluginNavButton` centered with
  `title` tooltips on every item; nav items now carry emoji icons
  (🏠 Главная, 📋 Задачи, 📅 Календарь, 📝 Заметки, 🧩 Расширения, ⚙️
  Администрирование).
- Space switcher collapses to a centered folder icon (name + chevron hidden),
  user card to the avatar only; both got `title` tooltips.
- Width transition for a smooth toggle.

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **168 passed**                         |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.9.3                      |

## Release

- Commit: `stage9(3): admin session lifetime & collapsible sidebar`
- Tag `v0.9.3` pushed to GitHub (triggers the release workflow).

## Notes

- Existing remember-me tokens (2-part, no expiry) are invalidated once by this
  release; the user logs in once and re-checks «Запомнить меня».
- `main` was updated to include `hotfix/v0.9.2` before this branch was cut, so
  v0.9.3 contains the remember-me boot fix.
- No other bugs were touched in this stage.
