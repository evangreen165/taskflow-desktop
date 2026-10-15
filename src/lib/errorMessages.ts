/** Human-readable (Russian) messages for backend error codes. */
export const ERROR_MESSAGES: Record<string, string> = {
  IO: "Ошибка ввода-вывода",
  NOT_FOUND: "Не найдено",
  ALREADY_EXISTS: "Уже существует",
  PERMISSION_DENIED: "Отказано в доступе",
  PARSE: "Некорректные данные",
  INVALID_PATH: "Некорректный путь",
  INVALID_INPUT: "Некорректный ввод",
  NOT_WORKSPACE: "Это не workspace TaskFlow",
  SCHEMA_TOO_NEW: "Версия workspace новее поддерживаемой",
  NO_WORKSPACE: "Workspace не активирован",
  LOCKED: "Объект заблокирован",
  AUTH_FAILED: "Неверный логин или пароль",
  AUTH_HASH: "Ошибка проверки пароля",
  WATCH: "Не удалось запустить наблюдение за файлами",
  LOG_INIT: "Не удалось инициализировать журнал",
  INTERNAL: "Внутренняя ошибка",
  AUTH_REQUIRED: "Требуется вход",
  FORBIDDEN: "Недостаточно прав",
  PASSWORD_CHANGE_REQUIRED: "Требуется сменить пароль",
  SESSION_INVALIDATED: "Миграция завершена, войдите заново",
  ROLE_NOT_FOUND: "Ваша роль не найдена, обратитесь к администратору",
  SELF_RESET_FORBIDDEN: "Смените свой пароль в профиле",
  MIGRATION_FAILED: "Миграция не удалась, обратитесь к администратору",
  MIGRATION_LOCKED: "Миграция уже выполняется, попробуйте позже",
  MIGRATION_LOCK_LOST: "Миграция прервана, попробуйте снова",
  ROLE_EMPTY: "Роль не имеет прав, обратитесь к администратору",
  LAST_ADMIN: "Нельзя деактивировать или понизить последнего администратора",
  FORBIDDEN_PATH: "Доступ к этому файлу запрещён",
  ROLE_FIXED: "Права роли администратора зафиксированы",
  ROLE_SYSTEM: "Системные роли нельзя удалить",
  ROLE_IN_USE: "Роль назначена пользователям",
};

export function messageForCode(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? code;
}
