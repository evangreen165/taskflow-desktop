import { useEffect, useRef, useState, type ReactNode } from "react";

import Avatar from "@/components/Avatar";
import NoAccess from "@/components/auth/NoAccess";
import RequirePerm from "@/components/auth/RequirePerm";
import TabsBar from "@/components/layout/TabsBar";
import NotificationBell from "@/components/notifications/NotificationBell";
import PluginFrame from "@/components/plugins/PluginFrame";
import CommandPalette from "@/components/search/CommandPalette";
import ChangeFolderModal from "@/components/workspace/ChangeFolderModal";
import { usePermissions } from "@/hooks/usePermissions";
import { appNavigate, tabTitleForPath } from "@/lib/navigate";
import AdminPage from "@/pages/admin/AdminPage";
import CalendarPage from "@/pages/calendar/CalendarPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import KbArticlePage from "@/pages/kb/KbArticlePage";
import KbPage from "@/pages/kb/KbPage";
import PluginsPage from "@/pages/plugins/PluginsPage";
import PluginViewerPage from "@/pages/plugins/PluginViewerPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import SettingsPage from "@/pages/settings/SettingsPage";
import TasksPage from "@/pages/tasks/TasksPage";
import { PluginsService, type PluginManifest } from "@/services/plugins";
import { SpacesService } from "@/services/spaces";
import { UsersService, type UserSummary } from "@/services/users";
import { WorkspaceService } from "@/services/workspace";
import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { usePluginStore } from "@/stores/usePluginStore";
import { isOwnPersonalSpace, isPersonalSpace, useSpaceStore } from "@/stores/useSpaceStore";
import { useTabStore } from "@/stores/useTabStore";

import styles from "./WorkspaceLayout.module.css";

function renderTabContent(path: string): JSX.Element {
  if (path.startsWith("/app/kb/")) {
    return <KbArticlePage noteId={path.slice("/app/kb/".length)} />;
  }
  if (path.startsWith("/app/kb")) return <KbPage />;
  if (path.startsWith("/app/dashboard")) return <DashboardPage />;
  if (path.startsWith("/app/tasks")) return <TasksPage />;
  if (path.startsWith("/app/calendar")) return <CalendarPage />;
  if (path.startsWith("/app/plugins/")) {
    return <PluginViewerPage pluginId={path.slice("/app/plugins/".length)} />;
  }
  if (path.startsWith("/app/plugins")) return <PluginsPage />;
  if (path.startsWith("/app/admin")) {
    return (
      <RequirePerm
        anyOf={["users.manage", "roles.manage", "space.manage", "audit.view"]}
        fallback={<NoAccess />}
      >
        <AdminPage />
      </RequirePerm>
    );
  }
  if (path.startsWith("/app/profile")) return <ProfilePage />;
  if (path.startsWith("/app/settings")) return <SettingsPage />;
  return <DashboardPage />;
}

function SideNavLink({
  to,
  disabled,
  title,
  children,
}: {
  to: string;
  disabled: boolean;
  title?: string;
  children: ReactNode;
}): JSX.Element {
  const activePath = useTabStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.path ?? "",
  );
  const isActive = activePath === to || activePath.startsWith(`${to}/`);
  if (disabled) {
    return (
      <span
        className={`${styles.navItem} ${styles.navDisabled}`}
        title={title ? `${title} — сначала смените пароль` : "Сначала смените пароль"}
      >
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      className={`${styles.navItem} ${isActive ? styles.active : ""}`}
      onClick={() => appNavigate(to)}
    >
      {children}
    </button>
  );
}

export default function WorkspaceLayout(): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const { can, role, user } = usePermissions();
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const initializedTabsRef = useRef(false);

  const forced = session?.mustChangePassword ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const userBtnRef = useRef<HTMLButtonElement | null>(null);
  // The user menu is rendered with `position: fixed` so it is never clipped by
  // the sidebar (which can overflow-hide in collapsed mode).
  const [userMenuPos, setUserMenuPos] = useState<{ bottom: number; left: number } | null>(null);

  function toggleUserMenu(): void {
    if (!menuOpen && userBtnRef.current) {
      const rect = userBtnRef.current.getBoundingClientRect();
      setUserMenuPos({
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
        left: Math.max(8, rect.left),
      });
    }
    setMenuOpen((open) => !open);
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("taskflow.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleSidebar(): void {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem("taskflow.sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

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
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberUsers, setMemberUsers] = useState<UserSummary[]>([]);
  const [memberDraft, setMemberDraft] = useState<string[]>([]);
  const [membersBusy, setMembersBusy] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [pluginPanelOpen, setPluginPanelOpen] = useState(false);
  const pluginBusy = usePluginStore((s) => s.busy);
  const extensionsEnabled = usePluginStore((s) => s.extensionsEnabled);
  const pluginStates = usePluginStore((s) => s.pluginStates);
  const loadExtensions = usePluginStore((s) => s.loadExtensions);

  const currentSpace = spaces.find((space) => space.id === currentSpaceId) ?? null;
  const canAdmin =
    can("users.manage") || can("roles.manage") || can("space.manage") || can("audit.view");
  const personalOwner = isOwnPersonalSpace(currentSpace, user?.id);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  // Only plugins explicitly enabled in the settings inject their UI.
  const enabledPlugins = plugins.filter((plugin) => pluginStates[plugin.id] === true);
  const injectedSidebar = enabledPlugins.filter((plugin) => plugin.ui?.inject === "sidebar");
  const injectedTopbar = enabledPlugins.filter((plugin) => plugin.ui?.inject === "topbar");
  const injectedFloating = enabledPlugins.filter((plugin) => plugin.ui?.inject === "floating");
  const openPluginName =
    activePluginId !== null
      ? (plugins.find((plugin) => plugin.id === activePluginId)?.name ?? activePluginId)
      : null;
  const fetchNotifications = useNotificationStore((s) => s.fetch);

  useEffect(() => {
    void fetchSpaces();
  }, [fetchSpaces]);

  // Load tab behaviour settings once and push them into the tab store.
  useEffect(() => {
    void WorkspaceService.getTabSettings().then((result) => {
      if (result.ok) {
        useTabStore
          .getState()
          .setTabSettings(result.value.openNotesInNewTab, result.value.openTasksInNewTab);
      }
    });
  }, []);

  // Initialise the active tab from the URL once (deep link / F5). This reads
  // `window.location.hash` directly — the component does not observe the
  // router, so Back/Forward can never spawn tabs.
  useEffect(() => {
    if (initializedTabsRef.current) {
      return;
    }
    initializedTabsRef.current = true;
    const hashPath = window.location.hash.replace(/^#/, "");
    const path = hashPath.startsWith("/app") ? hashPath : "/app/dashboard";
    if (path === "/app" || path === "/app/") {
      appNavigate("/app/dashboard", { replace: true });
      return;
    }
    useTabStore.getState().openTab(tabTitleForPath(path), path);
  }, []);

  // Poll notifications so assignments from other users appear without a reload.
  useEffect(() => {
    void fetchNotifications();
    const timer = setInterval(() => void fetchNotifications(), 30_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

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

  // Ctrl+K on Windows/Linux, Cmd+K on macOS opens the command palette.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load plugins once so injected sidebar/topbar/floating buttons render.
  useEffect(() => {
    let cancelled = false;
    void PluginsService.list().then((result) => {
      if (!cancelled && result.ok) {
        setPlugins(result.value);
      }
    });
    void loadExtensions();
    return () => {
      cancelled = true;
    };
  }, [loadExtensions]);

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

  /** Opens a plugin in the modal; the iframe stays mounted when minimized. */
  function openPlugin(id: string): void {
    setActivePluginId(id);
    setPluginPanelOpen(true);
  }

  async function openMembers(): Promise<void> {
    if (!currentSpace) {
      return;
    }
    setSpaceMenuOpen(false);
    setMemberDraft([...currentSpace.members]);
    setMembersError(null);
    setMembersOpen(true);
    const result = await UsersService.directory();
    if (result.ok) {
      setMemberUsers(result.value);
    }
  }

  function toggleMember(userId: string): void {
    if (!currentSpace || userId === currentSpace.ownerId) {
      return;
    }
    setMemberDraft((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function saveMembers(): Promise<void> {
    if (!currentSpace) {
      return;
    }
    setMembersBusy(true);
    setMembersError(null);
    const result = await SpacesService.update(
      currentSpace.id,
      currentSpace.name,
      currentSpace.description,
      memberDraft,
    );
    setMembersBusy(false);
    if (!result.ok) {
      setMembersError(result.error.message);
      return;
    }
    await fetchSpaces();
    setMembersOpen(false);
  }

  async function handleLogout(): Promise<void> {
    await logout();
    appNavigate("/login", { replace: true });
  }

  return (
    <div className={styles.app}>
      <aside
        className={sidebarCollapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}
      >
        <div className={styles.collapseWrap}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            ☰
          </button>
        </div>
        <div className={styles.logo}>
          <div className={styles.mark}>T</div>
          <div className={styles.logoText}>
            TaskFlow<span>{workspace?.name ?? "workspace"}</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navLabel}>Работа</div>
          <SideNavLink to="/app/dashboard" disabled={forced} title="Главная">
            <span aria-hidden="true">🏠</span>
            <span className={styles.itemText}>Главная</span>
          </SideNavLink>
          <SideNavLink to="/app/tasks" disabled={forced} title="Задачи">
            <span aria-hidden="true">📋</span>
            <span className={styles.itemText}>Задачи</span>
          </SideNavLink>
          <SideNavLink to="/app/calendar" disabled={forced} title="Календарь">
            <span aria-hidden="true">📅</span>
            <span className={styles.itemText}>Календарь</span>
          </SideNavLink>
          <SideNavLink to="/app/kb" disabled={forced} title="Заметки">
            <span aria-hidden="true">📝</span>
            <span className={styles.itemText}>Заметки</span>
          </SideNavLink>
          {extensionsEnabled ? (
            <SideNavLink to="/app/plugins" disabled={forced} title="Расширения">
              <span aria-hidden="true">🧩</span>
              <span className={styles.itemText}>Расширения</span>
            </SideNavLink>
          ) : null}
          <div className={styles.navLabel}>Управление</div>
          {canAdmin ? (
            <SideNavLink to="/app/admin" disabled={forced} title="Администрирование">
              <span aria-hidden="true">⚙️</span>
              <span className={styles.itemText}>Администрирование</span>
            </SideNavLink>
          ) : null}
          {injectedSidebar.length > 0 ? (
            <>
              <div className={styles.navLabel}>Плагины</div>
              {injectedSidebar.map((plugin) => (
                <button
                  key={plugin.id}
                  type="button"
                  className={styles.pluginNavButton}
                  title={plugin.name}
                  onClick={() => appNavigate(`/app/plugins/${plugin.id}`, { title: plugin.name })}
                >
                  <span aria-hidden="true">
                    {plugin.id === "obsidian-graph" ? "🕸️" : "🧩"}
                  </span>
                  <span className={styles.itemText}>{plugin.name}</span>
                  {pluginBusy[plugin.id] ? (
                    <span className={styles.pluginBusyDot} aria-label="Идёт генерация…" />
                  ) : null}
                </button>
              ))}
            </>
          ) : null}
        </nav>

        <div className={styles.footer}>
          <div className={styles.menuWrap} ref={menuRef}>
            {menuOpen ? (
              <div
                className={styles.userMenu}
                role="menu"
                style={
                  userMenuPos
                    ? {
                        position: "fixed",
                        bottom: userMenuPos.bottom,
                        left: userMenuPos.left,
                        right: "auto",
                        width: 220,
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    appNavigate("/app/profile");
                  }}
                >
                  Мой профиль
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    appNavigate("/app/settings");
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
              ref={userBtnRef}
              className={styles.userCard}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={`${user?.displayName ?? "—"} · ${role?.name ?? "—"}`}
              onClick={toggleUserMenu}
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
              title={currentSpace?.name ?? "Пространство"}
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
                {personalOwner ? (
                  <button
                    type="button"
                    className={styles.spaceMembers}
                    onClick={() => void openMembers()}
                  >
                    👥 Участники
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.searchButton}
            onClick={() => setPaletteOpen(true)}
            aria-label="Глобальный поиск"
          >
            <span className={styles.searchIcon} aria-hidden="true">
              🔍
            </span>
            <span className={styles.searchLabel}>Поиск задач и заметок…</span>
            <kbd className={styles.searchKbd}>{isMac ? "⌘ K" : "Ctrl K"}</kbd>
          </button>
          <NotificationBell />
          {injectedTopbar.map((plugin) => (
            <button
              key={plugin.id}
              type="button"
              className={styles.pluginTopbarButton}
              onClick={() => openPlugin(plugin.id)}
              title={plugin.name}
            >
              🧩 {plugin.name}
            </button>
          ))}
          <div className={styles.spacer} />
          <button className="btn-ghost" type="button" onClick={() => setChangeFolderOpen(true)}>
            Сменить папку
          </button>
        </header>
        <TabsBar />
        <div className={styles.content}>
          {activeTab ? (
            renderTabContent(activeTab.path)
          ) : (
            <div className={styles.muted}>Нет открытых вкладок.</div>
          )}
        </div>
      </div>

      {changeFolderOpen ? <ChangeFolderModal onClose={() => setChangeFolderOpen(false)} /> : null}

      {membersOpen && currentSpace ? (
        <div className={styles.modalBackdrop} onClick={() => setMembersOpen(false)}>
          <div
            className={styles.spaceModal}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Участники «{currentSpace.name}»</h3>
            <p className={styles.membersHint}>
              Добавьте коллег, чтобы открыть им доступ к этому личному пространству.
            </p>
            {membersError ? (
              <div className="alert" style={{ marginBottom: 14 }}>
                {membersError}
              </div>
            ) : null}
            <div className={styles.memberList}>
              {memberUsers.map((member) => (
                <label key={member.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={memberDraft.includes(member.id) || member.id === currentSpace.ownerId}
                    disabled={member.id === currentSpace.ownerId}
                    onChange={() => toggleMember(member.id)}
                  />
                  <span>{member.displayName}</span>
                  {member.id === currentSpace.ownerId ? (
                    <span className={styles.ownerBadge}>владелец</span>
                  ) : null}
                </label>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button className="btn-ghost" type="button" onClick={() => setMembersOpen(false)}>
                Отмена
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={membersBusy}
                onClick={() => void saveMembers()}
              >
                {membersBusy ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {injectedFloating.map((plugin) => (
        <button
          key={plugin.id}
          type="button"
          className={styles.pluginFab}
          onClick={() => openPlugin(plugin.id)}
          title={plugin.name}
          aria-label={`Открыть плагин ${plugin.name}`}
        >
          🧩
          {pluginBusy[plugin.id] ? (
            <span className={styles.pluginFabSpinner} aria-label="Идёт генерация…" />
          ) : null}
        </button>
      ))}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {activePluginId !== null ? (
        <div
          className={`${styles.pluginModalBackdrop} ${
            pluginPanelOpen ? "" : styles.pluginModalHidden
          }`}
        >
          <div
            className={styles.pluginModalCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.pluginModalHeader}>
              <span className={styles.pluginModalTitle}>🧩 {openPluginName}</span>
              <button className="btn-ghost" type="button" onClick={() => setPluginPanelOpen(false)}>
                Свернуть
              </button>
            </div>
            <PluginFrame pluginId={activePluginId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
