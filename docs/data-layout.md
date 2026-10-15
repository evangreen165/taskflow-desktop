# TaskFlow — структура данных workspace (SMB)

Приложение работает без сервера: все данные лежат в общей папке (SMB-шара или локальный диск),
путь к которой пользователь указывает при первом запуске. Путь хранится **только локально** на
машине (Tauri store, `app-config.json`) и никогда не попадает в файлы данных.

Все пути внутри данных — **относительные** от корня workspace. Абсолютные пути, `..` и
диск-префиксы (`C:`) отклоняются слоем Storage.

```
{TASKFLOW_DATA}/
  config.json                       настройки workspace
  users/{login}.json                учётные записи (Argon2-хеш пароля, роль)
  roles/{roleId}.json               роли и их права
  projects/{projectId}.json         метаданные проектов
  tasks/{taskId}.json               по одной задаче на файл
  tasks/index.json                  опциональный кэш списка (только чтение)
  notes/{noteId}/note.md            тело заметки в Markdown
  notes/{noteId}/meta.json          заголовок, теги, автор, даты, версия
  attachments/{sha256}.{ext}        контент-адресуемые вложения (дедупликация)
  locks/{entity}-{id}.lock          файлы-замки для редактирования (TTL)
  events/{timestamp}-{uuid}.json    append-only журнал изменений
  audit/{yyyy-mm}.log               журнал действий пользователей (JSONL)
```

## config.json

```json
{
  "schemaVersion": 1,
  "workspaceId": "3f1c…uuid",
  "name": "Компания",
  "createdAt": "2026-10-15T12:00:00.000Z"
}
```

Создаётся эксклюзивно (`O_CREAT|O_EXCL`): два одновременных первых запуска не смогут занять одну
папку. Поле `schemaVersion` защищает от открытия более новой версии workspace.

## users/{login}.json

```json
{
  "login": "admin",
  "name": "Алексей Ковалёв",
  "passwordHash": "$argon2id$v=19$m=…",
  "role": "admin",
  "createdAt": "2026-10-15T12:00:00.000Z",
  "avatarColor": "#5b5bd6"
}
```

- `login` — `^[a-z][a-z0-9._-]{0,63}$` (строчные латинские буквы/цифры/`.`,`_`,`-`).
- Пароль хранится только как PHC-хеш Argon2; открытый пароль нигде не сохраняется.
- Файл создаётся эксклюзивно при регистрации.

## roles/{roleId}.json

```json
{
  "id": "admin",
  "name": "Администратор",
  "description": "Полный доступ к workspace…",
  "permissions": ["task.view", "task.create", "users.manage", "roles.manage", "audit.view"],
  "isSystem": true,
  "color": "#5b5bd6"
}
```

При создании workspace записываются системные роли: `admin`, `manager`, `executor`, `observer`,
`kb_author`, `kb_reader` (набор прав повторяет матрицу прав из UI-прототипа).

## locks/{entity}-{id}.lock

```json
{
  "key": "task-T-42",
  "owner": "machine-uuid",
  "token": "session-token-uuid",
  "acquiredAt": "2026-10-15T12:00:00.000Z",
  "expiresAt": "2026-10-15T12:05:00.000Z"
}
```

- Ключ `{entity}-{id}`: `entity` — `^[a-z][a-z0-9_]{0,31}$`, `id` — `[A-Za-z0-9._-]{1,128}`.
- Замок берётся эксклюзивным созданием файла; `token` нужен, чтобы снять только свой замок.
- Просроченные замки (по `expiresAt`) автоматически переиспользуются.

## events/{timestamp}-{uuid}.json

Append-only журнал изменений: на каждое событие — отдельный неизменяемый файл.

```json
{
  "id": "uuid",
  "ts": "2026-10-15T12:00:00.000Z",
  "actor": "admin",
  "kind": "workspace.created",
  "entity": "workspace",
  "entityId": "3f1c…",
  "data": { "name": "Компания" }
}
```

## audit/{yyyy-mm}.log

Журнал действий пользователей, JSON Lines (одна запись на строку). Наполняется через слой
`tracing` (события с target `taskflow_audit`).

```json
{
  "ts": "2026-10-15T12:00:00.000Z",
  "actor": "admin",
  "action": "user.create",
  "entity": "user",
  "entityId": "admin",
  "detail": { "role": "admin" }
}
```

## Атомарность и параллелизм

- Записи сущностей — атомарные: содержимое пишется во временный файл-сосед
  (`.taskflow-{name}.{uuid}.tmp`) и заменяется через `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`
  (Windows) или `rename` (Unix). На SMB-шаре такая замена атомарна.
- Регистрация (пользователи, config) — эксклюзивное создание файла.
- Редактирование защищается замками с TTL.
- `tasks/index.json` — кэш списка, приложение его только читает и не перезаписывает конкурентно.
