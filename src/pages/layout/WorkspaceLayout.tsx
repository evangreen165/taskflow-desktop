import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import Avatar from "@/components/Avatar";
import ChangeFolderModal from "@/components/workspace/ChangeFolderModal";
import { usePermissions } from "@/hooks/usePermissions";
import { SpacesService } from "@/services/spaces";
import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isPersonalSpace, useSpaceStore } from "@/stores/useSpaceStore";

import styles from "./WorkspaceLayout.module.css";

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
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const { can, role, user } = usePermissions();
  const navigate = useNavigate();

  const forced = session?.mustChangePassword ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);
  const setCurrentSpace = useSpaceStore((s) => s.setCurrentSpace);
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const spaceRef = useRef<HTMLDivElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [changeFolderOpen, setChangeFolderOpen] = useState(false);

  const currentSpace = spaces.find((space) => space.id === currentSpaceId) ?? null;

  useEffect(() => {
    void fetchSpaces();
  }, [fetchSpaces]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (spaceRef.current && !spaceRef.current.contains(target)) {
        setSpaceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function createSpace(): Promise<void> {
    const name = newSpaceName.trim();
    if (!name) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    const result = await SpacesService.create(name, newSpaceDesc.trim());
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error.message);
      return;
    }
    await fetchSpaces();
    setCurrentSpace(result.value.id);
    setCreateOpen(false);
    setNewSpaceName("");
    setNewSpaceDesc("");
  }

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
              <Avatar
                name={user?.displayName ?? "—"}
                color={user?.avatarColor ?? "#5b5bd6"}
                sha256={user?.avatarSha256}
                size={32}
              />
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
          <div className={styles.spaceWrap} ref={spaceRef}>
            <button
              type="button"
              className={styles.spaceButton}
              aria-haspopup="menu"
              aria-expanded={spaceMenuOpen}
              onClick={() => setSpaceMenuOpen((open) => !open)}
            >
              <span className={styles.spaceIcon}>
                {isPersonalSpace(currentSpaceId) ? "🔒" : "📁"}
              </span>
              <span className={styles.spaceName}>{currentSpace?.name ?? "Пространство"}</span>
              <span className={styles.chevron}>{spaceMenuOpen ? "▴" : "▾"}</span>
            </button>
            {spaceMenuOpen ? (
              <div className={styles.spaceMenu} role="menu">
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    role="menuitem"
                    className={`${styles.spaceItem} ${
                      space.id === currentSpaceId ? styles.spaceItemActive : ""
                    }`}
                    onClick={() => {
                      setCurrentSpace(space.id);
                      setSpaceMenuOpen(false);
                    }}
                  >
                    <span>{isPersonalSpace(space.id) ? "🔒" : "📁"}</span>
                    {space.name}
                  </button>
                ))}
                {can("space.create") ? (
                  <button
                    type="button"
                    className={styles.spaceCreate}
                    onClick={() => {
                      setSpaceMenuOpen(false);
                      setNewSpaceName("");
                      setNewSpaceDesc("");
                      setCreateError(null);
                      setCreateOpen(true);
                    }}
                  >
                    + Создать пространство
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.spacer} />
          <button className="btn-ghost" type="button" onClick={() => setChangeFolderOpen(true)}>
            Сменить папку
          </button>
        </header>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>

      {changeFolderOpen ? <ChangeFolderModal onClose={() => setChangeFolderOpen(false)} /> : null}

      {createOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setCreateOpen(false)}>
          <div
            className={styles.spaceModal}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Новое пространство</h3>
            {createError ? (
              <div className="alert" style={{ marginBottom: 14 }}>
                {createError}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="sp-name">Название</label>
              <input
                id="sp-name"
                type="text"
                autoFocus
                value={newSpaceName}
                onChange={(event) => setNewSpaceName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-desc">Описание</label>
              <input
                id="sp-desc"
                type="text"
                value={newSpaceDesc}
                onChange={(event) => setNewSpaceDesc(event.target.value)}
              />
            </div>
            <div className={styles.modalActions}>
              <button className="btn-ghost" type="button" onClick={() => setCreateOpen(false)}>
                Отмена
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={creating}
                onClick={() => void createSpace()}
              >
                {creating ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
