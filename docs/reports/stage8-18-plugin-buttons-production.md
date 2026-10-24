# Stage 8.18 — Remove Iframe Sandbox & Fix Plugin Scripts (v0.8.8)

- **Status:** implemented, all gates green, release tag pushed
- **Branch:** `hotfix/v0.8.8`
- **Commit:** `stage8(18): remove iframe sandbox & fix plugin scripts`

## Problem

The plugin UI renders in the release build but buttons do nothing (clicks
ignored, «＋ Новый чат» unresponsive) even after switching the iframe to a
`blob:` URL. Root cause: the WebView2 `sandbox` attribute is too strict for
local plugins and blocks their JavaScript in production.

## Task 1 — Remove the iframe `sandbox` attribute

`src/components/plugins/PluginFrame.tsx`:
- The `sandbox="..."` attribute is removed entirely; the plugin iframe is now
  rendered as
  `<iframe ref={iframeRef} className={styles.frame} srcDoc={htmlContent} />`
  (unsandboxed, local + trusted plugin content). Styling stays in the CSS
  module (`.frame { flex: 1; width: 100%; border: none; background: #fff; }`).
- The `blob:` URL machinery from the previous attempt was dropped — `srcDoc`
  without a sandbox is the most reliable path in Tauri WebView2.
- The postMessage bridge keeps `event.source === iframe.contentWindow` as the
  only gate (no strict origin checks), which is correct for `srcdoc`.

## Task 2 — Plugin HTML

Re-audited `src-tauri/resources/plugins/llm-assistant/index.html`: every
button is bound with `addEventListener('click', …)` inside the `<script>` at
the bottom of `<body>` (`newChatBtn`, `send`, `settingsBtn`, `modelToggle`,
`loadModels`, `closeSettings`, `saveSettings`, …). There are **zero** inline
`onclick=`/`onchange=`/`javascript:` attributes, so no HTML changes were
needed (verified by grep).

## Task 3 — Disable CSP

`src-tauri/tauri.conf.json`: `"csp": null` — CSP is completely disabled for
the local desktop app, removing all WebView2 inline-script/frame blocking.
(No CSP header is injected, and since the app is a local desktop client this
is safe.)

## Files touched

```
src/components/plugins/PluginFrame.tsx   (unsandboxed srcdoc iframe, bridge intact)
src-tauri/tauri.conf.json                ("csp": null, version 0.8.8)
CHANGELOG.md                             ([0.8.8] updated)
docs/reports/stage8-18-plugin-buttons-production.md (this report, rewritten)
```

## Gates

| Gate                   | Result                                 |
| ---------------------- | -------------------------------------- |
| `cargo test`           | **164 passed**, 0 failed               |
| `npm run test`         | **119 passed** (26 files)              |
| `npm run lint`         | clean (`--max-warnings 0`)             |
| `npm run build`        | success (tsc + vite)                   |

## Release

- Commit: `stage8(18): remove iframe sandbox & fix plugin scripts`
- Tag: `v0.8.8` moved to this commit and force-pushed to `origin` (the tag
  previously pointed at the earlier stage8(18) commit; the release workflow
  re-runs on the tag push and republishes the release with `latest.json`).

## Notes / follow-ups

- Unsandboxed `srcdoc` means the plugin runs with the app's origin and full
  same-origin privileges — an accepted trade-off since plugins are local,
  bundled, and trusted content.
- No other bugs were touched in this stage.
