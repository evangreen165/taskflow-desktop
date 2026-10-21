import { useCallback, useEffect, useState } from "react";

import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/lib/permissions";
import { canDeleteRole, slugifyRoleId, validateRoleDraft } from "@/lib/roleForm";
import { AuthService } from "@/services/auth";
import { PermissionsService } from "@/services/permissions";
import { RolesService } from "@/services/roles";
import { SpacesService, type Space } from "@/services/spaces";
import type { Role, UserInfo, UserPatch } from "@/services/types";
import { UsersService, type UserSummary } from "@/services/users";
import { isPersonalSpace } from "@/stores/useSpaceStore";

import styles from "./AdminPage.module.css";

type Tab = "users" | "spaces" | "roles";

const COLOR_PRESETS = ["#5b5bd6", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("ru-RU");
}

export default function AdminPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "users" ? styles.tabActive : ""}`}
          onClick={() => setTab("users")}
        >
          Пользователи
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "spaces" ? styles.tabActive : ""}`}
          onClick={() => setTab("spaces")}
        >
          Пространства
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "roles" ? styles.tabActive : ""}`}
          onClick={() => setTab("roles")}
        >
          Роли
        </button>
      </div>
      {tab === "users" ? <UsersTab /> : tab === "spaces" ? <SpacesTab /> : <RolesTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

function SpacesTab(): JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState({ name: "", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    members: string[];
  } | null>(null);

  const load = useCallback(async () => {
    const [spacesResult, usersResult] = await Promise.all([
      SpacesService.list(),
      UsersService.directory(),
    ]);
    if (!spacesResult.ok) {
      setError(spacesResult.error.message);
      return;
    }
    setSpaces(spacesResult.value);
    if (usersResult.ok) {
      setUsers(usersResult.value);
    }
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(): Promise<void> {
    if (!create.name.trim()) {
      setError("Укажите название пространства.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await SpacesService.create(create.name.trim(), create.description.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreate({ name: "", description: "" });
    await load();
  }

  function startEdit(space: Space): void {
    setEditingId(space.id);
    setDraft({
      name: space.name,
      description: space.description,
      members: [...space.members],
    });
  }

  function toggleMember(userId: string): void {
    if (!draft) {
      return;
    }
    setDraft({
      ...draft,
      members: draft.members.includes(userId)
        ? draft.members.filter((id) => id !== userId)
        : [...draft.members, userId],
    });
  }

  async function submitEdit(space: Space): Promise<void> {
    if (!draft) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await SpacesService.update(
      space.id,
      draft.name.trim(),
      draft.description.trim(),
      draft.members,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEditingId(null);
    setDraft(null);
    await load();
  }

  async function submitDelete(space: Space): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await SpacesService.delete(space.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <div className={styles.section}>
      {error ? (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div className={styles.card}>
        <h3>Новое пространство</h3>
        <div className={styles.formGrid}>
          <div className="field">
            <label htmlFor="spc-name">Название</label>
            <input
              id="spc-name"
              type="text"
              value={create.name}
              onChange={(event) => setCreate({ ...create, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="spc-desc">Описание</label>
            <input
              id="spc-desc"
              type="text"
              value={create.description}
              onChange={(event) => setCreate({ ...create, description: event.target.value })}
            />
          </div>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void submitCreate()}
        >
          {busy ? "Создание…" : "Создать пространство"}
        </button>
      </div>

      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Пространство</th>
              <th>Участники</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) =>
              editingId === space.id && draft ? (
                <tr key={space.id}>
                  <td>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                    <input
                      type="text"
                      value={draft.description}
                      placeholder="Описание"
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </td>
                  <td>
                    <div className={styles.memberList}>
                      {users.map((member) => (
                        <label key={member.id} className={styles.memberOption}>
                          <input
                            type="checkbox"
                            checked={
                              draft.members.includes(member.id) || member.id === space.ownerId
                            }
                            disabled={member.id === space.ownerId}
                            onChange={() => toggleMember(member.id)}
                          />
                          {member.displayName}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        className="btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => void submitEdit(space)}
                      >
                        Сохранить
                      </button>
                      <button
                        className="btn-ghost"
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setDraft(null);
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={space.id}>
                  <td>
                    <b>
                      {isPersonalSpace(space.id) ? "🔒" : "📁"} {space.name}
                    </b>
                    {space.description ? (
                      <div className={styles.muted}>{space.description}</div>
                    ) : null}
                  </td>
                  <td>{space.members.length}</td>
                  <td>
                    <div className={styles.rowActions}>
                      {isPersonalSpace(space.id) ? (
                        <span className={styles.muted}>Личное пространство</span>
                      ) : (
                        <>
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => startEdit(space)}
                          >
                            Изменить
                          </button>
                          <button
                            className="btn-ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => void submitDelete(space)}
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface CreateForm {
  login: string;
  password: string;
  displayName: string;
  email: string;
  roleId: string;
}

interface EditDraft {
  displayName: string;
  email: string;
  roleId: string;
  avatarColor: string;
  isActive: boolean;
}

function UsersTab(): JSX.Element {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [create, setCreate] = useState<CreateForm>({
    login: "",
    password: "",
    displayName: "",
    email: "",
    roleId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    const [usersResult, rolesResult] = await Promise.all([
      UsersService.list(),
      RolesService.list(),
    ]);
    if (!usersResult.ok) {
      setError(usersResult.error.message);
      return;
    }
    if (!rolesResult.ok) {
      setError(rolesResult.error.message);
      return;
    }
    setUsers(usersResult.value);
    setRoles(rolesResult.value);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleName = (roleId: string): string => roles.find((r) => r.id === roleId)?.name ?? roleId;
  const activeAdmins = users.filter((u) => u.isActive && u.roleId === "admin").length;
  const isLastActiveAdmin = (user: UserInfo): boolean =>
    user.roleId === "admin" && user.isActive && activeAdmins === 1;

  async function submitCreate(): Promise<void> {
    if (!create.login.trim() || !create.password || !create.displayName.trim() || !create.roleId) {
      setError("Заполните логин, пароль, имя и роль.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await AuthService.register(
      create.login.trim(),
      create.password,
      create.displayName.trim(),
      create.roleId,
      create.email.trim() || null,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreate({ login: "", password: "", displayName: "", email: "", roleId: "" });
    await load();
  }

  function startEdit(user: UserInfo): void {
    setEditingId(user.id);
    setDraft({
      displayName: user.displayName,
      email: user.email ?? "",
      roleId: user.roleId,
      avatarColor: user.avatarColor,
      isActive: user.isActive,
    });
  }

  async function submitEdit(user: UserInfo): Promise<void> {
    if (!draft) {
      return;
    }
    const patch: UserPatch = {};
    if (draft.displayName !== user.displayName) {
      patch.displayName = draft.displayName;
    }
    if (draft.email !== (user.email ?? "")) {
      patch.email = draft.email || null;
    }
    if (draft.roleId !== user.roleId) {
      patch.roleId = draft.roleId;
    }
    if (draft.avatarColor !== user.avatarColor) {
      patch.avatarColor = draft.avatarColor;
    }
    if (draft.isActive !== user.isActive) {
      patch.isActive = draft.isActive;
    }
    setBusy(true);
    setError(null);
    const result = await UsersService.update(user.id, patch);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEditingId(null);
    setDraft(null);
    await load();
  }

  async function submitDeactivate(user: UserInfo): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await UsersService.deactivate(user.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  async function submitReset(user: UserInfo): Promise<void> {
    if (resetPassword.length < 8) {
      setError("Пароль должен содержать не менее 8 символов.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await AuthService.resetPassword(user.id, resetPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setResettingId(null);
    setResetPassword("");
    await load();
  }

  return (
    <div className={styles.section}>
      {error ? (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div className={styles.card}>
        <h3>Новый пользователь</h3>
        <div className={styles.formGrid}>
          <div className="field">
            <label htmlFor="nu-login">Логин</label>
            <input
              id="nu-login"
              type="text"
              value={create.login}
              spellCheck={false}
              onChange={(e) => setCreate({ ...create, login: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-name">Имя</label>
            <input
              id="nu-name"
              type="text"
              value={create.displayName}
              onChange={(e) => setCreate({ ...create, displayName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-password">Пароль</label>
            <input
              id="nu-password"
              type="password"
              value={create.password}
              autoComplete="new-password"
              onChange={(e) => setCreate({ ...create, password: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-email">Email</label>
            <input
              id="nu-email"
              type="email"
              value={create.email}
              onChange={(e) => setCreate({ ...create, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nu-role">Роль</label>
            <select
              id="nu-role"
              value={create.roleId}
              onChange={(e) => setCreate({ ...create, roleId: e.target.value })}
            >
              <option value="">— выберите роль —</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void submitCreate()}
        >
          {busy ? "Создание…" : "Создать пользователя"}
        </button>
      </div>

      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Последний вход</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={user.isActive ? "" : styles.inactive}>
                {editingId === user.id && draft ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={draft.displayName}
                        onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                      />
                      <div className={styles.colorRow}>
                        {COLOR_PRESETS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`${styles.swatch} ${
                              draft.avatarColor === color ? styles.swatchActive : ""
                            }`}
                            style={{ background: color }}
                            title={color}
                            onClick={() => setDraft({ ...draft, avatarColor: color })}
                          />
                        ))}
                        <input
                          type="color"
                          className={styles.colorInput}
                          value={draft.avatarColor}
                          title="Выбрать свой цвет"
                          onChange={(e) => setDraft({ ...draft, avatarColor: e.target.value })}
                        />
                      </div>
                    </td>
                    <td>{user.login}</td>
                    <td>
                      <select
                        value={draft.roleId}
                        onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={draft.isActive ? "1" : "0"}
                        onChange={(e) => setDraft({ ...draft, isActive: e.target.value === "1" })}
                      >
                        <option value="1">Активен</option>
                        <option value="0">Отключён</option>
                      </select>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className="btn-ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void submitEdit(user)}
                        >
                          Сохранить
                        </button>
                        <button
                          className="btn-ghost"
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span className={styles.userCell}>
                        <span className={styles.badge} style={{ background: user.avatarColor }}>
                          {user.displayName.charAt(0).toUpperCase()}
                        </span>
                        {user.displayName}
                      </span>
                    </td>
                    <td>{user.login}</td>
                    <td>{roleName(user.roleId)}</td>
                    <td>{user.isActive ? "Активен" : "Отключён"}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className="btn-ghost" type="button" onClick={() => startEdit(user)}>
                          Изменить
                        </button>
                        <button
                          className="btn-ghost"
                          type="button"
                          disabled={isLastActiveAdmin(user)}
                          title={
                            isLastActiveAdmin(user)
                              ? "Нельзя оставить workspace без администратора"
                              : undefined
                          }
                          onClick={() => void submitDeactivate(user)}
                        >
                          Отключить
                        </button>
                        <button
                          className="btn-ghost"
                          type="button"
                          onClick={() => {
                            setResettingId(user.id);
                            setResetPassword("");
                          }}
                        >
                          Сбросить пароль
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resettingId !== null ? (
        <div className={styles.card}>
          <h3>Сброс пароля</h3>
          <div className="field">
            <label htmlFor="reset-password">Новый пароль</label>
            <input
              id="reset-password"
              type="password"
              value={resetPassword}
              autoComplete="new-password"
              onChange={(e) => setResetPassword(e.target.value)}
            />
            <span className="hint">
              Пользователь будет обязан сменить пароль при следующем входе.
            </span>
          </div>
          <div className={styles.rowActions}>
            <button
              className="btn-primary"
              type="button"
              disabled={busy}
              onClick={() => {
                const target = users.find((u) => u.id === resettingId);
                if (target) {
                  void submitReset(target);
                }
              }}
            >
              Сбросить
            </button>
            <button className="btn-ghost" type="button" onClick={() => setResettingId(null)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

function RolesTab(): JSX.Element {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [create, setCreate] = useState({
    name: "",
    description: "",
    color: "#5b5bd6",
    permissions: [] as string[],
  });

  const load = useCallback(async () => {
    const [rolesResult, permsResult] = await Promise.all([
      RolesService.list(),
      PermissionsService.list(),
    ]);
    if (!rolesResult.ok) {
      setError(rolesResult.error.message);
      return;
    }
    if (!permsResult.ok) {
      setError(permsResult.error.message);
      return;
    }
    const rolesValue = rolesResult.value;
    setRoles(rolesValue);
    setPermissions(permsResult.value);
    setMatrix(Object.fromEntries(rolesValue.map((role) => [role.id, [...role.permissions]])));
    setDirty(new Set());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(roleId: string, perm: string): void {
    setMatrix((prev) => {
      const current = prev[roleId] ?? [];
      const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
      return { ...prev, [roleId]: next };
    });
    setDirty((prev) => {
      const next = new Set(prev);
      next.add(roleId);
      return next;
    });
  }

  async function saveMatrix(): Promise<void> {
    setBusy(true);
    setError(null);
    for (const roleId of dirty) {
      const result = await RolesService.update(roleId, { permissions: matrix[roleId] ?? [] });
      if (!result.ok) {
        setBusy(false);
        setError(result.error.message);
        return;
      }
    }
    setBusy(false);
    setDirty(new Set());
    await load();
  }

  function toggleCreatePermission(perm: string): void {
    setCreate((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  }

  async function submitCreate(): Promise<void> {
    const validation = validateRoleDraft(create);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    const id = slugifyRoleId(
      create.name,
      roles.map((role) => role.id),
    );
    const result = await RolesService.create(
      id,
      create.name.trim(),
      create.description.trim(),
      create.color,
      create.permissions,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreate({ name: "", description: "", color: "#5b5bd6", permissions: [] });
    await load();
  }

  async function submitDelete(role: Role): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await RolesService.delete(role.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <div className={styles.section}>
      {error ? (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div className={styles.card}>
        <h3>Новая роль</h3>
        <div className={styles.formGrid}>
          <div className="field">
            <label htmlFor="nr-name">Название</label>
            <input
              id="nr-name"
              type="text"
              value={create.name}
              onChange={(e) => setCreate({ ...create, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nr-description">Описание</label>
            <input
              id="nr-description"
              type="text"
              value={create.description}
              onChange={(e) => setCreate({ ...create, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Цвет</label>
            <div className={styles.colorRow}>
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch} ${create.color === color ? styles.swatchActive : ""}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => setCreate({ ...create, color })}
                />
              ))}
              <input
                type="color"
                className={styles.colorInput}
                value={create.color}
                title="Выбрать свой цвет"
                onChange={(e) => setCreate({ ...create, color: e.target.value })}
              />
              <span className={styles.muted}>{create.color}</span>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Права</label>
          <div className={styles.permissionPicker}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className={styles.permGroupBlock}>
                <div className={styles.permGroupTitle}>{group.label}</div>
                {group.permissions
                  .filter((perm) => permissions.includes(perm))
                  .map((perm) => (
                    <label key={perm} className={styles.permOption}>
                      <input
                        type="checkbox"
                        checked={create.permissions.includes(perm)}
                        onChange={() => toggleCreatePermission(perm)}
                      />
                      {PERMISSION_LABELS[perm] ?? perm}
                    </label>
                  ))}
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void submitCreate()}
        >
          {busy ? "Создание…" : "Создать роль"}
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.matrixHeader}>
          <h3>Матрица прав</h3>
          <div className={styles.rowActions}>
            <span className={styles.muted}>{dirty.size} ролей изменено</span>
            <button
              className="btn-primary"
              type="button"
              disabled={busy || dirty.size === 0}
              onClick={() => void saveMatrix()}
            >
              Сохранить
            </button>
          </div>
        </div>

        <div className={styles.chips}>
          {roles.map((role) => (
            <span
              key={role.id}
              className={`${styles.chip} ${role.empty ? styles.chipEmpty : ""}`}
              title={
                role.empty ? "У роли нет ни одного права" : `${role.name} · ${role.description}`
              }
            >
              <span className={styles.dot} style={{ background: role.color }} />
              {role.name}
              {role.empty ? " ⚠" : ""}
              {canDeleteRole(role) ? (
                <button
                  className={styles.chipDelete}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitDelete(role)}
                  title="Удалить роль"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
        </div>

        <div className={styles.matrixScroll}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>Право</th>
                {roles.map((role) => (
                  <th key={role.id} className={styles.matrixRole}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <PermissionRow
                  key={group.id}
                  label={group.label}
                  permissions={group.permissions.filter((p) => permissions.includes(p))}
                  roles={roles}
                  matrix={matrix}
                  busy={busy}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  label,
  permissions,
  roles,
  matrix,
  busy,
  onToggle,
}: {
  label: string;
  permissions: string[];
  roles: Role[];
  matrix: Record<string, string[]>;
  busy: boolean;
  onToggle: (roleId: string, perm: string) => void;
}): JSX.Element {
  return (
    <>
      {permissions.map((perm) => (
        <tr key={perm}>
          <td className={styles.permCell}>
            <span className={styles.permGroup}>{label}</span>
            {PERMISSION_LABELS[perm] ?? perm}
          </td>
          {roles.map((role) => {
            const granted = (matrix[role.id] ?? []).includes(perm);
            const readonly = role.isSystem && role.id === "admin";
            return (
              <td key={role.id} className={styles.checkCell}>
                <input
                  type="checkbox"
                  checked={granted}
                  disabled={busy || readonly}
                  onChange={() => onToggle(role.id, perm)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
