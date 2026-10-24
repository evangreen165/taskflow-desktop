# Stage 8.18 — Fix Plugin Buttons in Production (v0.8.8)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `hotfix/v0.8.8` (based on `hotfix/v0.8.7`; the previous hotfixes
  were never merged to `main`, so this release carries stages 15–18)
- **Commit:** `stage8(18): fix plugin buttons in production`

## Problem

In the release (WebView2) build the AI-assistant plugin window opens and
renders, but clicks do nothing («＋ Новый чат» ignores clicks, buttons dead),
while the same build works in dev. Classic WebView2 production `srcDoc` issue:
`srcdoc` iframes can get a `null` origin that silently breaks the `postMessage`
bridge, and inline scripts can be blocked by the production CSP.

## Task 1 — Switch `srcDoc` → `blob:` URL (`src/components/plugins/PluginFrame.tsx`)

- The plugin HTML (already fetched via `PluginsService.getContent`) is now
  wrapped in `new Blob([htmlContent], { type: "text/html" })` and served to the
  iframe through `URL.createObjectURL`; the URL is revoked in the effect
  cleanup when the content changes.
- `<iframe src={iframeUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />`
  — `allow-popups` added for the plugin's `target="_blank"` links.
- The iframe only renders once the blob URL exists; loading/error states stay.
- The existing CSP already permits `blob:` frames (`frame-src 'self' data: blob:`)
  and inline scripts (`script-src * 'unsafe-inline'`), so no config change.

## Task 2 — PostMessage bridge without strict origin checks

Blob origins in WebView2 production are unpredictable
(`blob:http://tauri.localhost/…`), so the strict `event.origin` allow-list was
removed. The bridge now accepts a `taskflow:request` when and only when
`event.source === iframe.contentWindow` (the plugin frame). The plugin's own
listener already keys responses by `id` and posts with `"*"`.

## Task 3 — Plugin inline handlers

Audited `src-tauri/resources/plugins/llm-assistant/index.html`: it already
binds every control with `addEventListener` inside the `<script>` block
(`newChatBtn`, `send`, `settingsBtn`, `modelToggle`, `loadModels`, …) and has
**zero** inline `onclick=`/`onchange=` attributes, so no HTML changes were
needed. (Verified with a grep for `onclick=`/`onchange=`/`javascript:` — no
matches.)

## Files touched

```
src/components/plugins/PluginFrame.tsx   (blob URL iframe, no origin checks, allow-popups)
package.json / package-lock.json / src-tauri/tauri.conf.json  (0.8.8)
CHANGELOG.md                             ([0.8.8])
docs/reports/stage8-18-plugin-buttons-production.md (this report)
```

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **164 passed**, 0 failed               |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |
| `npm run version:check`| version OK: 0.8.8                      |

## Release

- Commit: `stage8(18): fix plugin buttons in production`
- Tag: `v0.8.8` pushed to `origin` (triggers `.github/workflows/release.yml`,
  which builds MSI/EXE and publishes the GitHub Release with `latest.json`).

## Notes / follow-ups

- `blob:` origins for the plugin iframe also restore reliable
  `localStorage` access (`allow-same-origin` + blob inherits the app origin).
- No other bugs were touched in this stage.
