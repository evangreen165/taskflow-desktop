# Stage 8.2 — Plugin Communication Bridge

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(2): plugin communication bridge`

## Goal

Two-way `postMessage` bridge between the React app and a plugin iframe, so
plugins can read tasks/notes, create notes, and show toasts without direct IPC
access.

## Frontend — `src/pages/plugins/PluginViewerPage.tsx`

### Message handling

- The page registers `window.addEventListener("message", handleMessage)` (and
  removes it on unmount).
- The handler only accepts `{ type: "taskflow:request", id, action, payload }`
  messages **whose `event.source` is the plugin iframe's `contentWindow`** —
  messages from other windows/tabs are ignored.
- The response is posted back into the iframe:

  ```js
  {
    type: ("taskflow:response", id, data, error);
  }
  ```

  `error` is `null` on success, otherwise a message string. The iframe window is
  re-read at response time (`iframeRef.current?.contentWindow`), so a stale
  window after navigation is handled safely.

### Supported actions (whitelist)

| Action           | Payload                          | Call                         |
| ---------------- | -------------------------------- | ---------------------------- |
| `getTasks`       | —                                | `TasksService.list(spaceId)` |
| `getNotes`       | —                                | `NotesService.list(spaceId)` |
| `getNoteContent` | `{ noteId }` (or `{ id }`)       | `NotesService.get`           |
| `createNote`     | `{ title, category?, content? }` | `NotesService.create`        |
| `showToast`      | `{ message }`                    | `useToastStore.push`         |

- Actions run against the **current space** (`useSpaceStore.currentSpaceId`);
  without one the bridge replies with an error.
- Unknown actions and malformed payloads return an error to the plugin.

### Security & permissions

- Source check: `event.source === iframeRef.current.contentWindow`.
- Only whitelisted actions exist — plugins **cannot** delete tasks, change
  roles, or call arbitrary IPC.
- Every call goes through the existing backend commands, so the current user's
  RBAC applies (`createNote` needs `article.create` / personal-space owner;
  `getNoteContent` needs space access).
- `showToast` only shows a toast; it cannot fake errors or read data.

## SDK — `docs/PLUGIN_SDK.md`

- "Talking to the core" section now documents the **implemented** bridge:
  request/response format, the actions table, a reusable `callPlugin(action,
payload)` JavaScript helper, and a full example plugin that fetches tasks and
  prints them.
- Added ideas for real plugins: note-graph visualization, an LLM assistant that
  calls OpenRouter from inside the iframe, and custom analytics.
- Security notes updated: source check + whitelist + backend RBAC; manifest
  `permissions` gating remains a future stage.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **158 passed**, 0 failed                              |
| `npm run test`  | **117 passed** (25 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src/pages/plugins/PluginViewerPage.tsx  (bridge + iframe ref)
docs/PLUGIN_SDK.md                      (implemented bridge + example code)
docs/reports/stage8-2-plugin-bridge.md  (this report)
```

## Known limitations / follow-ups

- The bridge is scoped to the current space; cross-space queries need a future
  `spaceId` option in the payload.
- Manifest `permissions` are not yet enforced; the action whitelist is the
  current boundary.
- `getNoteContent` returns the whole `Note` object (meta + content), not just
  the text; documented in the SDK table.
- No automated tests for the bridge yet (it depends on iframe/window behavior
  that jsdom does not model); the action wiring is type-checked.
