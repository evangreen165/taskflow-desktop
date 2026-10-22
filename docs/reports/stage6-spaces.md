# Stage 6 — Spaces (Personal & Shared), Cross-space Collaboration

- **Status:** released as **v0.6.0** (2026-10-22)
- **Branch:** `stage6/spaces-ui` → merged into `main` with `--no-ff`
- **Commits:**
  - `b88014b` stage6(1): spaces backend & migration
  - `5bf43ba` stage6(2): spaces architecture & UI
  - `d13b02c` stage6(2b): cross-space transfer, note sharing & dashboard badges
  - `c6b1a45` stage6(3): admin permissions fix & onboarding UX
  - `aee5cb6` stage6(4): space switcher scroll & owner logic
  - `f592fd7` stage6(5): space isolation & personal owner rights
  - `b7f075b` fix: calendar dnd geometric overlap with sidebar (stage6-fix)
  - `3d210cf` feat: Stage 6 — Spaces (Personal & Shared), Cross-space Collaboration (merge)
  - `6fd7d94` docs: release 0.6.0 (Stage 6 - Spaces & Collaboration)

## Goal

Move TaskFlow from a single flat workspace to multiple **spaces**, so teams can
separate projects while each account also gets a private **personal space**. All
data must remain plain JSON/Markdown on the SMB folder, with optimistic locking
and RBAC preserved.

## Data model & storage

```
workspace/
  spaces/{spaceId}/space.json        # Space { id, name, description, ownerId, members[] }
  spaces/{spaceId}/tasks/...
  spaces/{spaceId}/notes/...
  spaces/{spaceId}/categories.json   # KB categories are space-scoped (Stage 6.5)
```

- Space ids are validated (`[a-z0-9_-]`, ≤ 64 chars) to prevent traversal.
- Personal spaces use the deterministic id `personal_{userId}` and are created
  automatically for every account.
- Schema migration v2 → v3 moved existing tasks/notes into the `default` space
  and backfilled roles/personal spaces on activation.

## Delivered

### 6.1 — Backend & migration

- New `spaces` module: create/update/delete/list/get, membership checks,
  personal-space bootstrap, id validation, path resolution.
- Migration v2 → v3: existing `tasks/` and `notes/` moved under `spaces/default/`.
- Space id is now a required argument for all task/note/attachment commands.

### 6.2 — UI & personal spaces

- Space switcher in the topbar; `useSpaceStore` persists the current space.
- All task/note/dashboard requests pass `spaceId`.
- Personal space auto-creation (`personal_{userId}`) on user creation/backfill.
- Cross-space task transfer and note sharing (`sharedWithSpaces`), dashboard
  badges for spaces.

### 6.3 — Admin permissions & safe folder switching

- `backfill.rs`: idempotent repair on workspace activation.
  - Admin role always carries the full permission registry.
  - Every account has a personal space.
  - System roles gain missing seed permissions (additive).
- `ChangeFolderModal` for safely switching the SMB workspace folder.

### 6.4 — Space switcher scroll & owner logic

- `.spaceMenu` got `max-height: 300px; overflow-y: auto` so "+ Создать" stays
  reachable.
- New `space.manage` permission: grants management of **any** space.
- A space **owner** can always update/delete their own space without
  `space.manage` (owner check happens before role lookup).
- Frontend permission registry (`src/lib/permissions.ts`) and admin role matrix
  updated to expose `space.manage`.

### 6.5 — Space isolation & personal owner rights

- KB **categories moved per space** (`spaces/{spaceId}/categories.json`);
  commands take `spaceId`, the store refetches on space switch, and a backfill
  copies legacy root categories into existing spaces.
- **Personal-space owner bypass:** in `personal_{userId}` the owner has full
  note rights (create/edit/publish/delete, categories, sharing) regardless of
  global role permissions. Implemented with `spaces::is_personal_owner` and
  `require_space_perm` in note commands.
- Space member management stays owner-controlled; the Space Switcher gained a
  "Участники" modal for personal-space owners (no `space.manage` required).
- Granular admin access: sidebar link visible for any of
  `users.manage | roles.manage | space.manage | audit.view`; admin tabs render
  conditionally.
- **Windows MAX_PATH fix:** `fsops::atomic_replace` now prefixes paths with
  `\\?\` (and `\\?\UNC\` for UNC) before `MoveFileExW`, so version-history
  writes in long personal-space paths no longer fail with error 3.

### Post-stage fix — Calendar DnD

- Tasks without a due date are fetched separately (`hasDueDate: false`) so the
  "Без срока" sidebar is populated.
- Dragging a scheduled task into the sidebar failed because the horizontally
  scrollable calendar grid extended **geometrically** under the sidebar and won
  `pointerWithin`. The custom collision detector now gives the `unscheduled`
  droppable explicit priority when the pointer is inside its rect.

## Permissions summary

| Capability                          | Required                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Create space                        | `space.create`                                                                      |
| Manage any space (metadata/members) | `space.manage`, admin, or owner of that space                                       |
| Read/write tasks in a space         | membership + `task.*`; visibility limited to author/assignee unless `task.view_all` |
| Read notes                          | membership + `article.view`, or owner of the personal space                         |
| Write notes                         | `article.*`, or owner of the personal space (full bypass)                           |
| KB categories                       | `article.create`, or owner of the personal space                                    |
| Admin page                          | any of `users.manage`, `roles.manage`, `space.manage`, `audit.view`                 |

## Tests & gates

- Rust: `cargo test` — 130 tests, including spaces isolation, personal-owner
  bypass, backfill repairs, category migration, long-path atomic writes.
- Frontend: `npm run test` — 107 tests.
- `npm run lint` (zero warnings), `npm run build` (tsc + vite).

## Known limitations / follow-ups

- Global search (Stage 7.1) searches notes physically stored in accessible
  spaces; notes merely _shared into_ a space are found only when the user also
  belongs to the source space.
- The in-app RBAC is accidental-damage protection, not a security boundary;
  see README "Security Model & Limitations" for NTFS ACL guidance.
- `cargo test` emits pre-existing chunk-size / dependency warnings; no failures.
