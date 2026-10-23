# Stage 8.10 — Extend LLM for Tasks and Categories

- **Status:** implemented, gates green
- **Branch:** `stage8/plugins-sdk`
- **Commit:** `stage8(10)`

## Task 1 — `createTask` bridge action

The bridge lives in `src/components/plugins/PluginFrame.tsx` (extracted from
`PluginViewerPage` in Stage 8.3). Added `createTask`:

```ts
payload: { title, description?, priority?, dueDate?, assignees?, tags? }
→ TasksService.create(spaceId, { title, description, priority, dueDate, assignees, tags })
→ returns the created Task
```

Validation:

- `title` is required (trimmed);
- `priority` must be `low|medium|high|critical`, otherwise defaults to `medium`;
- `dueDate` is a `YYYY-MM-DD` string or `null`;
- `assignees`/`tags` are filtered to string arrays.

> `assignees` are **user ids** and must be members of the current space (the
> backend returns `INVALID_ASSIGNEE` otherwise). The LLM normally omits them.

## Task 2 — `createCategory` bridge action

```ts
payload: { name }
→ NotesService.createCategory(spaceId, name)
→ returns the updated category list
```

`name` is required and trimmed.

`docs/PLUGIN_SDK.md` documents both actions in the supported-actions table.

## Task 3 — LLM plugin prompt & parser

### System prompt

The model is told it has **three** special JSON outputs:

1. `{"action":"create_notes","notes":[...]}`
2. `{"action":"create_tasks","tasks":[{"title":"...","description":"...","priority":"high"}]}`
3. `{"action":"create_category","name":"..."}`

and to answer normal questions as Markdown text.

### Parser

`extractCreateNotes` became the generic `extractAction` (fenced JSON block or a
bare JSON substring, any `action`).

`handleReply` now:

- `create_notes` → `createNote` per item, «Создано N заметок»;
- `create_tasks` → `createTask` per item (title/description/priority/dueDate/
  assignees/tags), «Создано N задач» (proper Russian plural);
- `create_category` → `createCategory`, «Категория «…» создана»;
- anything else → rendered as Markdown text.

Each path also shows a toast.

## How to test

1. Update the plugin in the workspace (`plugins/llm-assistant/index.html`).
2. Open the chat (🧩 FAB) with Ollama or OpenRouter configured.
3. Ask: _«Создай 3 задачи: подготовить релиз (high), обновить документацию
   (medium), проверить обновления (low)»_ → tasks appear under **Задачи** and the
   chat shows «Создано 3 задачи».
4. Ask: _«Создай категорию заметок "Архитектура"»_ → the category appears in the
   KB sidebar.
5. Ask: _«Создай заметку про плагины»_ → still works.

## Gates

| Gate            | Result                                                |
| --------------- | ----------------------------------------------------- |
| `cargo test`    | **160 passed**, 0 failed                              |
| `npm run test`  | **119 passed** (26 files)                             |
| `npm run lint`  | clean (`--max-warnings 0`)                            |
| `npm run build` | success (tsc + vite; pre-existing chunk-size warning) |

## Files touched

```
src/components/plugins/PluginFrame.tsx   (createTask + createCategory actions)
docs/PLUGIN_SDK.md                       (action table)
plugins/llm-assistant/index.html         (system prompt + create_tasks/create_category)
docs/reports/stage8-10-llm-tasks.md      (this report)
```

## Known limitations / follow-ups

- The LLM does not know user ids, so it cannot assign tasks; `assignees` must be
  provided as ids by a future plugin UI picker.
- Task `status` is not part of the bridge payload (tasks are created in the
  default `new` status).
- `createCategory` returns the full updated list (not just the new name).
