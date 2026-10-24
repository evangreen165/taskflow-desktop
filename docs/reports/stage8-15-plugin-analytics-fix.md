# Stage 8.15 — Plugin Protocol & Analytics Rendering Fix (v0.8.5)

- **Status:** implemented, all gates green
- **Branch:** `hotfix/v0.8.5` (from `main`)
- **Commit:** `stage8(15): fix plugin protocol and analytics rendering`

## Bug 1 — Plugins show a white screen (scripts/styles never load)

Root cause on Windows: Tauri serves custom protocols from
`http://{scheme}.localhost` (WebView2 rewrite), and the rewrite **drops the
original host**. The iframe was pointed at `plugin://{pluginId}/index.html`,
so on Windows the request arrived as `http://plugin.localhost/index.html`
(the plugin id was lost, the handler 404'd) and the CSP never allowed the
`http://plugin.localhost` origin for frames/scripts/styles.

Fixes:

1. `src/components/plugins/PluginFrame.tsx` — iframe now loads the canonical
   cross-platform URL `plugin://localhost/{pluginId}/index.html`:
   - macOS/Linux: `plugin://localhost/{pluginId}/index.html` (host `localhost`);
   - Windows: rewritten to `http://plugin.localhost/{pluginId}/index.html`
     (plugin id preserved as the first path segment).
   Both forms were already parsed by the Rust handler.
2. `src-tauri/tauri.conf.json` — CSP now allows the Windows origin in every
   plugin-relevant directive (in addition to the existing `plugin:` scheme):
   `default-src`, `connect-src`, `img-src`, `style-src`, `script-src` and
   `frame-src` all include `http://plugin.localhost`.
3. `src-tauri/src/plugin_protocol.rs`:
   - `.js`/`.mjs` are served as `application/javascript; charset=utf-8`
     (was `text/javascript`) so the browser executes them; `.html` →
     `text/html`, `.css` → `text/css` stay correct.
   - Route parsing was extracted into `split_route(&Uri)` and covered by
     tests for all platform URL forms (`plugin://<id>/`, `plugin://localhost/<id>/`,
     `http://plugin.localhost/<id>/`), MIME types, and end-to-end file serving
     with the correct `Content-Type` header, plus 404 for missing
     plugin/file/traversal.

## Bug 2 — Analytics widget (charts) disappears on tab switches

Cause: the widget remounts with empty local `spaceTasks` after a tab switch,
refetching from scratch; `recharts` `ResponsiveContainer` can also measure a
zero-size box while the widget is hidden.

Fixes in `src/components/dashboard/AnalyticsWidget.tsx` + `.module.css`:

1. Both charts are wrapped in
   `<ResponsiveContainer width="100%" height={300} minWidth={200}>`
   so recharts always has an explicit, measurable box.
2. New `useEffect` cache check: if `useTaskStore` already holds the current
   space's tasks, they are rendered immediately and **no duplicate request is
   issued**; a fetch is triggered only when both the props and the store are
   empty. Fresh props still win over cached store data when present.
3. `.analytics` container gets `min-height: 300px; min-width: 300px;` so the
   charts have room to render even while the parent remounts.

## Files touched

```
src-tauri/src/plugin_protocol.rs                   (application/javascript MIME, split_route, tests)
src-tauri/tauri.conf.json                          (CSP http://plugin.localhost, version 0.8.5)
src/components/plugins/PluginFrame.tsx             (plugin://localhost/<id>/index.html)
src/components/dashboard/AnalyticsWidget.tsx       (ResponsiveContainer 300/minWidth, store cache)
src/components/dashboard/AnalyticsWidget.module.css (min-height/min-width)
package.json / package-lock.json                   (0.8.5)
CHANGELOG.md                                       ([0.8.5])
docs/reports/stage8-15-plugin-analytics-fix.md     (this report)
```

## Gates

| Gate            | Result                                 |
| --------------- | -------------------------------------- |
| `cargo test`    | **164 passed**, 0 failed (4 new)       |
| `npm run test`  | **119 passed** (26 files)              |
| `npm run lint`  | clean (`--max-warnings 0`)             |
| `npm run build` | success (tsc + vite)                   |
| `npm run version:check` | version OK: 0.8.5              |

## Notes / follow-ups

- `plugin://<pluginId>/<path>` (host = plugin id) is still parsed by the
  handler for backward compatibility, but the iframe now always uses the
  `localhost` host form.
- The analytics store cache trusts `useTaskStore` for the current space; on a
  space switch the fresh props from `DashboardPage` take precedence as soon as
  they arrive, so a brief cached frame is the only edge case.
- No other bugs were touched in this hotfix.
