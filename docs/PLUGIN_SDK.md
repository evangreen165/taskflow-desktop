# TaskFlow Plugin SDK

TaskFlow lets you drop small, self-contained HTML plugins into a workspace and
open them in an isolated sandbox — no app rebuild required.

## How a plugin works

A plugin is a plain folder inside the workspace:

```
{workspace}/plugins/{plugin_id}/
  manifest.json
  index.html        (the entry, rendered in a sandboxed iframe)
```

The app scans `{workspace}/plugins/` and shows every valid plugin on the
**Расширения** page. Clicking **Открыть** loads the entry HTML into
`<iframe sandbox="allow-scripts allow-same-origin" srcdoc="...">`.

## manifest.json

```json
{
  "id": "my-graph",
  "name": "Граф заметок",
  "version": "1.0.0",
  "entry": "index.html",
  "permissions": ["read_notes", "write_notes"]
}
```

| Field         | Required | Notes                                                         |
| ------------- | -------- | ------------------------------------------------------------- |
| `id`          | yes      | must equal the folder name; `[a-z0-9._-]`, ≤ 64 characters    |
| `name`        | yes      | display name on the Расширения page                           |
| `version`     | yes      | semver-ish string shown on the card                           |
| `entry`       | no       | file to render; defaults to `index.html`                      |
| `permissions` | no       | declaration of intended capabilities (gated in a later stage) |

Folder names that do not match the `id`, and folders without a valid
`manifest.json`, are ignored by the scanner.

## The entry file

Any HTML. Inline `<script>` is allowed by the sandbox. Assets that live next to
the entry (CSS, JS, images) will not load automatically — the sandbox is a
single `srcdoc` document — so keep the plugin self-contained (inline styles and
scripts) for now.

## Sandboxing

- The plugin runs in an iframe with `sandbox="allow-scripts allow-same-origin"`.
- It has **no** access to the React app's state, stores, or DOM.
- It has **no** filesystem access and cannot call TaskFlow commands directly.
- `allow-same-origin` means the plugin shares the app's origin, so treat
  plugin HTML as trusted code (a future SDK stage may tighten this).

## Talking to the core (postMessage bridge)

Plugins reach TaskFlow data through a `postMessage` handshake with the host
(PluginViewerPage). Only messages whose `event.source` is the plugin's own
iframe are accepted.

### Request

```js
window.parent.postMessage(
  { type: "taskflow:request", id: "req-1", action: "getTasks", payload: {} },
  "*",
);
```

- `type`: always `"taskflow:request"`.
- `id`: a unique request id (the plugin matches the response by it).
- `action`: one of the supported actions below.
- `payload`: optional action arguments.

### Response

The host replies into the iframe:

```js
{ type: "taskflow:response", id: "req-1", data: ..., error: null }
```

`data` holds the result, `error` is a message string (or `null`) on failure.

### Supported actions

| Action           | Payload                          | Returns                           |
| ---------------- | -------------------------------- | --------------------------------- |
| `getTasks`       | —                                | tasks of the current space        |
| `getNotes`       | —                                | note list of the current space    |
| `getNoteContent` | `{ noteId }` (or `{ id }`)       | the `Note` (meta + content)       |
| `createNote`     | `{ title, category?, content? }` | the created `Note`                |
| `showToast`      | `{ message }`                    | `null` (shows a toast in the app) |

Only these actions exist: plugins cannot delete tasks, change roles, or touch
any data outside the current user's permissions (the backend enforces RBAC on
every call).

### JavaScript helper

```js
function callPlugin(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const handler = (event) => {
      if (event.data?.type === "taskflow:response" && event.data.id === id) {
        window.removeEventListener("message", handler);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.data);
      }
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "taskflow:request", id, action, payload }, "*");
  });
}

async function getTasks() {
  return callPlugin("getTasks");
}

async function getNoteContent(noteId) {
  return callPlugin("getNoteContent", { noteId });
}
```

### Example plugin

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Мой плагин</title>
  </head>
  <body>
    <h1>Привет из плагина!</h1>
    <button id="load">Показать мои задачи</button>
    <pre id="out"></pre>
    <script>
      function callPlugin(action, payload = {}) {
        return new Promise((resolve, reject) => {
          const id = Math.random().toString(36).slice(2);
          const handler = (event) => {
            if (event.data?.type === "taskflow:response" && event.data.id === id) {
              window.removeEventListener("message", handler);
              if (event.data.error) reject(new Error(event.data.error));
              else resolve(event.data.data);
            }
          };
          window.addEventListener("message", handler);
          window.parent.postMessage({ type: "taskflow:request", id, action, payload }, "*");
        });
      }

      document.getElementById("load").addEventListener("click", async () => {
        const tasks = await callPlugin("getTasks");
        document.getElementById("out").textContent = JSON.stringify(tasks, null, 2);
      });
    </script>
  </body>
</html>
```

### Ideas for real plugins

- **Визуализация графа:** `getNotes`, строит связи по тегам, рисует граф на
  Canvas/D3 внутри плагина.
- **LLM-помощник:** `getTasks`, формирует промпт, отправляет запрос в
  OpenRouter через `fetch` внутри iframe и показывает ответ.
- **Аналитика:** кастомные отчёты на основе `getTasks`/`getNotes`.

## Installing a plugin

1. Create `{workspace}/plugins/<id>/` (replace `<id>` with the manifest `id`).
2. Put `manifest.json` and `index.html` inside.
3. Reopen the **Расширения** page (or navigate to `/app/plugins`) — the plugin
   appears automatically; no rebuild or restart is needed.

## Security notes

- Only validated folder names are read; `..`/absolute paths are rejected.
- The iframe sandbox isolates scripts from the main application.
- The bridge accepts messages **only** from the plugin's own iframe
  (`event.source` check) and only the whitelisted actions above; delete/role
  actions are not exposed.
- Backend RBAC still applies to every bridge call, so `getNoteContent` /
  `createNote` respect the current user's permissions.
- `permissions` in the manifest is a **declaration**; manifest-based gating is a
  future SDK stage.
