import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";

import styles from "./WorkspacePage.module.css";

const NAV_ITEMS: { id: string; label: string }[] = [
  { id: "tasks", label: "Задачи" },
  { id: "calendar", label: "Календарь" },
  { id: "kb", label: "База знаний" },
  { id: "reports", label: "Отчёты" },
  { id: "admin", label: "Администрирование" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase();
}

export default function WorkspacePage(): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const machineId = useAppStore((s) => s.machineId);
  const chooseDifferentFolder = useAppStore((s) => s.chooseDifferentFolder);
  const requireLogin = useAppStore((s) => s.requireLogin);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout(): Promise<void> {
    await logout();
    requireLogin();
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.mark}>T</div>
          <div className={styles.logoText}>
            TaskFlow<span>{workspace?.name ?? "workspace"}</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navLabel}>Работа</div>
          {NAV_ITEMS.slice(0, 3).map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${index === 0 ? styles.active : ""}`}
              disabled={index !== 0}
            >
              {item.label}
            </button>
          ))}
          <div className={styles.navLabel}>Управление</div>
          {NAV_ITEMS.slice(3).map((item) => (
            <button key={item.id} type="button" className={styles.navItem} disabled>
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.userCard}>
            <div className={styles.avatar} style={{ background: user?.avatarColor ?? "#5b5bd6" }}>
              {initials(user?.name ?? "—")}
            </div>
            <div>
              <div className={styles.userName}>{user?.name ?? "Не выполнен вход"}</div>
              <div className={styles.userRole}>{user?.role ?? "—"}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <h2>Задачи</h2>
          <div className={styles.spacer} />
          <button className="btn-ghost" type="button" onClick={() => void chooseDifferentFolder()}>
            Сменить папку
          </button>
          <button className="btn-ghost" type="button" onClick={() => void handleLogout()}>
            Выйти
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.hero}>
            <h1>Workspace готов</h1>
            <p>
              Скелет приложения собран: выбран путь к данным, создан workspace и администратор.
              Storage-слой Rust и сервис <code>StorageService</code> на фронте готовы к
              использованию.
            </p>
            <dl className={styles.kv}>
              <dt>Workspace</dt>
              <dd>{workspace?.name ?? "—"}</dd>
              <dt>Папка данных</dt>
              <dd>{workspace?.path ?? "—"}</dd>
              <dt>ID workspace</dt>
              <dd>{workspace?.workspaceId ?? "—"}</dd>
              <dt>Схема</dt>
              <dd>v{workspace?.schemaVersion ?? "—"}</dd>
              <dt>Машина (lock owner)</dt>
              <dd>{machineId ?? "—"}</dd>
              <dt>Пользователь</dt>
              <dd>{user ? `${user.name} (${user.login})` : "—"}</dd>
            </dl>
            <div className={styles.next}>
              Следующий этап: портирование UI-прототипа (kanban, календарь, база знаний, матрица
              прав) в React-компоненты поверх готового Storage-слоя.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
