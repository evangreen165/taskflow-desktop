/** Pure permission helpers shared by guards, hooks and the admin matrix. */

export function can(permissions: readonly string[], perm: string): boolean {
  return permissions.includes(perm);
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: string[];
}

/** Grouped permission rows for the admin role-matrix. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "task",
    label: "Задачи",
    permissions: [
      "task.view",
      "task.create",
      "task.edit",
      "task.change_status",
      "task.assign",
      "task.view_all",
      "task.delete",
    ],
  },
  {
    id: "article",
    label: "База знаний",
    permissions: [
      "article.view",
      "article.create",
      "article.edit",
      "article.publish",
      "article.delete",
    ],
  },
  { id: "users", label: "Пользователи", permissions: ["users.manage"] },
  { id: "roles", label: "Роли", permissions: ["roles.manage"] },
  { id: "audit", label: "Аудит", permissions: ["audit.view"] },
  { id: "workspace", label: "Workspace", permissions: ["workspace.settings"] },
  {
    id: "space",
    label: "Пространства",
    permissions: ["space.create", "space.manage"],
  },
];

/** The 18-registry permission set (mirrors permissions::ALL). */
export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions,
);

/** Human-readable labels for the role-matrix rows. */
export const PERMISSION_LABELS: Record<string, string> = {
  "task.view": "Просмотр задач",
  "task.create": "Создание задач",
  "task.edit": "Редактирование задач",
  "task.change_status": "Смена статусов",
  "task.assign": "Назначение задач",
  "task.view_all": "Все задачи",
  "task.delete": "Удаление задач",
  "article.view": "Просмотр базы знаний",
  "article.create": "Создание статей",
  "article.edit": "Редактирование статей",
  "article.publish": "Публикация статей",
  "article.delete": "Удаление статей",
  "users.manage": "Управление пользователями",
  "roles.manage": "Управление ролями",
  "audit.view": "Просмотр аудита",
  "workspace.settings": "Настройки workspace",
  "space.create": "Создание пространств",
  "space.manage": "Управление пространствами",
};
