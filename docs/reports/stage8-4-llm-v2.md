# Stage 8.4 — LLM Assistant v2 (theme, history, models)

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(4)`

## Task 1 — API fixes

### Rust proxy (`commands/llm.rs`)

- `llmProxyRequest` now sends the OpenRouter-required headers
  `HTTP-Referer: https://github.com/evangreen165/taskflow-desktop` and
  `X-Title: TaskFlow` on every forwarded request (harmless for local Ollama).
- New **`llmProxyGet(url)`** command: a GET proxy (60 s timeout) used for public
  endpoints like `https://openrouter.ai/api/v1/models` — plugins can now load
  the model list without CORS.
- Both commands validate `http(s)` URLs and return the raw provider JSON.

### Plugin settings

- API URL is strictly defaulted to
  `https://openrouter.ai/api/v1/chat/completions` (falls back if empty).
- Model picker is a dropdown pre-filled with **valid free models**:
  - `meta-llama/llama-3-8b-instruct:free`
  - `meta-llama/llama-3.1-8b-instruct:free`
  - `mistralai/mistral-7b-instruct:free`
  - `google/gemma-7b-it:free`
  - `google/gemma-2-9b-it:free`
  - `nousresearch/hermes-3-llama-3.1-8b:free`
- Checkbox **«Только бесплатные»** filters the list to `:free` models.
- **«Загрузить список моделей»** calls `llmGet` on the OpenRouter models
  endpoint and populates the dropdown dynamically.

## Task 2 — UI/UX overhaul

### Theme

- New bridge action **`getTheme`** returns the resolved app theme
  (`"dark"`/`"light"`, resolving `"system"` via `prefers-color-scheme`).
- The plugin toggles a `.dark` class on `<body>`, which swaps CSS variables —
  the iframe follows the app's light/dark theme.

### Layout & history

- Chat app layout: left sidebar with **chat history** and «＋ Новый чат», right
  main area with messages and the composer.
- Sessions are saved in `localStorage` (`taskflow_llm_chats`); you can switch
  between chats and delete them. Titles come from the first user message.

### Markdown, typing, bubbles

- Lightweight regex-based Markdown renderer (fenced code blocks, headings,
  lists, bold/italic, inline code, links, paragraphs) — no external CDN, so it
  works under the app CSP. HTML is escaped first (XSS-safe).
- «Печатает…» indicator while the request is in flight.
- Distinct message bubbles (user = accent right, assistant = surface left).

## Task 3 — Agent prompt

The system prompt now instructs the assistant to act as a real TaskFlow helper
(concise, Russian, Markdown). When notes are requested, it still returns only
the `{"action":"create_notes","notes":[...]}` JSON block; the plugin parses it,
creates the notes through `createNote`, and posts a friendly chat message +
toast («Создано N заметки»). Non-JSON replies render as Markdown.

## How to test

1. Copy the updated plugin into the workspace:
   ```
   copy plugins/llm-assistant {workspace}/plugins/llm-assistant   (overwrite index.html)
   ```
   Reopen the app / Расширения page (the plugin loads on demand).
2. Click the 🧩 FAB → the chat opens with a left history sidebar.
3. ⚙ Настройки: API URL already set to OpenRouter; paste your API key; pick a
   free model (e.g. `meta-llama/llama-3-8b-instruct:free`); optionally
   «Загрузить список моделей»; save.
4. Send _«Создай три заметки про TaskFlow: архитектура, плагины,
   безопасность»_ → the app creates them and shows the toast.
5. Start a new chat, ask a Markdown-heavy question (lists, code) to see the
   rendering; switch between chats; toggle the app theme to verify the iframe
   follows it.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **159 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src-tauri/src/commands/llm.rs               (provider headers + llmProxyGet)
src-tauri/src/lib.rs                          (handler)
src/services/llm.ts, llm.test.ts              (get proxy)
src/components/plugins/PluginFrame.tsx        (getTheme + llmGet actions)
docs/PLUGIN_SDK.md                            (getTheme/llmGet rows)
plugins/llm-assistant/index.html              (v2 rewrite)
docs/reports/stage8-4-llm-v2.md               (this report)
```

## Known limitations / follow-ups

- The model list is fetched from OpenRouter's public endpoint; the «Только
  бесплатные» filter relies on the `:free` suffix.
- The Markdown renderer is intentionally lightweight (no tables/nested lists).
- The API key stays in the plugin's `localStorage` (sandboxed iframe).
- `createNote` still ignores `tags` (backend payload has no tags yet).
