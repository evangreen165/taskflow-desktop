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

## Talking to the core (planned bridge)

The supported way for a plugin to reach TaskFlow data is a `postMessage`
handshake with the host:

1. Plugin sends a request:
   ```js
   window.parent.postMessage(
     { type: "taskflow:request", id: "req-1", method: "tasks.list", payload: {} },
     "*",
   );
   ```
2. The host (TaskFlow) invokes the corresponding backend command and replies:
   ```js
   window.addEventListener("message", (event) => {
     if (event.data?.type !== "taskflow:response" || event.data.id !== "req-1") return;
     console.log(event.data.ok, event.data.data);
   });
   ```

The `method` names and the response schema will be defined as the SDK matures;
planned methods: `tasks.list`, `notes.list`, `spaces.list`, `users.directory`.

## Example plugin

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Мой плагин</title>
  </head>
  <body>
    <h1>Привет из плагина!</h1>
    <p>Этот текст рендерится внутри песочницы.</p>
    <script>
      // Показываем, что скрипты работают.
      document.querySelector("h1").style.color = "#5b5bd6";
    </script>
  </body>
</html>
```

## Installing a plugin

1. Create `{workspace}/plugins/<id>/` (replace `<id>` with the manifest `id`).
2. Put `manifest.json` and `index.html` inside.
3. Reopen the **Расширения** page (or navigate to `/app/plugins`) — the plugin
   appears automatically; no rebuild or restart is needed.

## Security notes

- Only validated folder names are read; `..`/absolute paths are rejected.
- The iframe sandbox isolates scripts from the main application.
- `permissions` in the manifest is a **declaration**; enforcement (granting
  read/write of tasks, notes, etc. through the bridge) is planned for a later
  SDK stage.
