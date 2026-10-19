import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { usePermissions } from "@/hooks/usePermissions";
import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";

import styles from "./WorkspaceLayout.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase();
}

function SideNavLink({
  to,
  disabled,
  children,
}: {
  to: string;
  disabled: boolean;
  children: ReactNode;
}): JSX.Element {
  if (disabled) {
    return (
      <span className={`${styles.navItem} ${styles.navDisabled}`} title="Сначала смените пароль">
        {children}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}
    >
      {children}
    </NavLink>
  );
}

export default function WorkspaceLayout(): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const chooseDifferentFolder = useAppStore((s) => s.chooseDifferentFolder);
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const { can, role, user } = usePermissions();
  const navigate = useNavigate();

  const forced = session?.mustChangePassword ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login", { replace: true });
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
          <SideNavLink to="/app/dashboard" disabled={forced}>
            🏠 Главная
          </SideNavLink>
          <SideNavLink to="/app/tasks" disabled={forced}>
            Задачи
          </SideNavLink>
          <SideNavLink to="/app/calendar" disabled={forced}>
            Календарь
          </SideNavLink>
          <SideNavLink to="/app/kb" disabled={forced}>
            Заметки
          </SideNavLink>
          <div className={styles.navLabel}>Управление</div>
          {can("users.manage") ? (
            <SideNavLink to="/app/admin" disabled={forced}>
              Администрирование
            </SideNavLink>
          ) : null}
        </nav>

        <div className={styles.footer}>
          <div className={styles.menuWrap} ref={menuRef}>
            {menuOpen ? (
              <div className={styles.userMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/app/profile");
                  }}
                >
                  Мой профиль
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/app/settings");
                  }}
                >
                  Настройки приложения
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuLogout}
                  onClick={() => {
                    setMenuOpen(false);
                    void handleLogout();
                  }}
                >
                  Выйти
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className={styles.userCard}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <div className={styles.avatar} style={{ background: user?.avatarColor ?? "#5b5bd6" }}>
                {initials(user?.displayName ?? "—")}
              </div>
              <div className={styles.userText}>
                <div className={styles.userName}>{user?.displayName ?? "—"}</div>
                <div className={styles.userRole}>{role?.name ?? "—"}</div>
              </div>
              <span className={styles.chevron}>{menuOpen ? "▴" : "▾"}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <h2>TaskFlow</h2>
          <div className={styles.spacer} />
          <button className="btn-ghost" type="button" onClick={() => void chooseDifferentFolder()}>
            Сменить папку
          </button>
        </header>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
