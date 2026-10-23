# Stage 8.8 — Critical Encoding, SMB Freeze & LLM Modal Fixes

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(8)`

## Bug 1 — Garbled text / encoding

**Root cause:** a previous in-place edit of `src/pages/layout/WorkspaceLayout.tsx`
used PowerShell `Get-Content`/`Set-Content` without `-Encoding UTF8`. On this
machine that round-trip used the Windows ANSI codepage, so every Cyrillic string
was destroyed (replacement characters).

**Fix:**

- Restored `WorkspaceLayout.tsx` from the last known-good commit (`dd3809e`) and
  re-applied the 8.7 modal/busy changes using the UTF-8-safe editor tool.
- Scanned **all** `.ts/.tsx/.html/.css/.md/.json` files under `src/` and
  `plugins/` — every file is now valid UTF-8 (no `U+FFFD`).
- Confirmed the root `index.html` still has `<meta charset="UTF-8" />`.

> Process rule: never rewrite source files with shell `Set-Content`; use the
> editor/write tools (UTF-8) for any file containing non-ASCII text.

## Bug 2 — App freezes during SMB load

- **Overlapping polls are now impossible**: every 30 s poll is guarded by an
  in-flight flag:
  - `useTaskStore.fetchTasksSilently` — module-level `silentFetchInFlight`;
  - `useNotificationStore.fetch` — `notificationFetchInFlight`;
  - `DashboardPage` — `summaryFetchRef` / `spaceTasksFetchRef` (`useRef`).
    A slow SMB response no longer stacks new requests on top of the previous one.
- **Watcher** verified: `notify` and the debounce loop run on dedicated threads;
  the main event loop is not involved.
- Added `#[tracing::instrument]` to the heavy commands (LLM proxy, plugins
  scan/read, offline-update check, attachments, storage reads) so slow commands
  are visible in the log with their duration.

## Bug 3 — LLM plugin timeout & modal unmount

- **Timeout**: `llm_proxy_request` now builds its client with a **300 s** timeout
  (local models can take minutes).
- **Modal stays mounted**: `WorkspaceLayout` keeps `activePluginId` mounted and
  toggles `pluginPanelOpen`; closing/minimizing uses CSS `display: none`, so the
  iframe (and the in-flight LLM request) survives outside clicks.
- The floating button shows a spinner while the plugin reports `setBusy(true)`.
- Chat switching inside the plugin is internal JS (re-rendering the message
  list), never an iframe reload.

## How to test

1. Verify the UI text is no longer garbled (Russian labels render correctly).
2. Under a large SMB transfer, leave the app open > 1 minute — polls no longer
   pile up; commands complete one at a time.
3. Ask Ollama a long question, click outside the modal — the chat minimizes, the
   spinner keeps running, and reopening shows the answer (no 120 s timeout).
4. Switch between saved chats inside the plugin — no iframe reload.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **160 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src/pages/layout/WorkspaceLayout.tsx      (restored UTF-8 + 8.7 changes)
src/stores/useTaskStore.ts                (in-flight poll guard)
src/stores/useNotificationStore.ts        (in-flight poll guard)
src/pages/dashboard/DashboardPage.tsx     (poll guards)
src-tauri/src/commands/llm.rs             (300 s timeout + #[instrument])
src-tauri/src/commands/plugins.rs         (#[instrument])
src-tauri/src/commands/updater.rs         (#[instrument])
src-tauri/src/commands/attachments.rs     (#[instrument])
src-tauri/src/commands/storage.rs         (#[instrument])
docs/reports/stage8-8-critical-fixes.md   (this report)
```

## Known limitations / follow-ups

- `#[instrument]` records at INFO level; a slow-command alert (>10 s) could be
  added later by filtering span durations.
- The encoding regression came from a shell edit; the source tree is verified
  UTF-8 now.
