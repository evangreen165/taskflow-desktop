import { useCallback, useEffect, useState } from "react";

import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/lib/permissions";
import { AuthService } from "@/services/auth";
import { PermissionsService } from "@/services/permissions";
import { RolesService } from "@/services/roles";
import type { Role, UserInfo, UserPatch } from "@/services/types";
import { UsersService } from "@/services/users";

import styles from "./AdminPage.module.css";

type Tab = "users" | "roles";

const AVATAR_COLORS = ["#5b5bd6", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

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
          className={`${styles.tab} ${tab === "roles" ? styles.tabActive : ""}`}
          onClick={() => setTab("roles")}
        >
          Роли
        </button>
      </div>
      {tab === "users" ? <UsersTab /> : <RolesTab />}
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

  const [create, setCreate] = useState({ id: "", name: "", description: "", color: "#5b5bd6" });

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

  async function submitCreate(): Promise<void> {
    if (!create.id.trim() || !create.name.trim()) {
      setError("Укажите id и имя роли.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await RolesService.create(
      create.id.trim(),
      create.name.trim(),
      create.description.trim(),
      create.color,
      [],
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreate({ id: "", name: "", description: "", color: "#5b5bd6" });
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
            <label htmlFor="nr-id">ID (латиницей)</label>
            <input
              id="nr-id"
              type="text"
              value={create.id}
              spellCheck={false}
              onChange={(e) => setCreate({ ...create, id: e.target.value })}
            />
          </div>
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
            <label htmlFor="nr-color">Цвет</label>
            <select
              id="nr-color"
              value={create.color}
              onChange={(e) => setCreate({ ...create, color: e.target.value })}
            >
              {AVATAR_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
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
              {role.isSystem ? (
                ""
              ) : (
                <button
                  className={styles.chipDelete}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitDelete(role)}
                  title="Удалить роль"
                >
                  ✕
                </button>
              )}
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
