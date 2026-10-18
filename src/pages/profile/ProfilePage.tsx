import { useState } from "react";

import { useAuthStore } from "@/stores/useAuthStore";

import styles from "./ProfilePage.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("ru-RU");
}

export default function ProfilePage(): JSX.Element {
  const session = useAuthStore((s) => s.session);
  const changePassword = useAuthStore((s) => s.changePassword);

  const forced = session?.mustChangePassword ?? false;
  const user = session?.user;
  const role = session?.role;

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(): Promise<void> {
    if (newPassword.length < 8) {
      setError("Пароль должен содержать не менее 8 символов.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    const result = await changePassword(oldPassword, newPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDone(true);
    setOldPassword("");
    setNewPassword("");
    setConfirm("");
  }

  return (
    <div className={styles.page}>
      {forced ? (
        <div className={styles.forcedBanner}>
          Сначала смените пароль — до этого остальные разделы недоступны.
        </div>
      ) : null}

      {forced ? null : (
        <div className={styles.card}>
          <div className={styles.head}>
            <div className={styles.avatar} style={{ background: user?.avatarColor ?? "#5b5bd6" }}>
              {initials(user?.displayName ?? "?")}
            </div>
            <div>
              <h1>{user?.displayName ?? "—"}</h1>
              <p className={styles.muted}>
                @{user?.login ?? "—"} · {role?.name ?? "—"}
              </p>
            </div>
          </div>
          <dl className={styles.kv}>
            <dt>Email</dt>
            <dd>{user?.email ?? "—"}</dd>
            <dt>Дата регистрации</dt>
            <dd>{formatDate(user?.createdAt ?? null)}</dd>
            <dt>Последний вход</dt>
            <dd>{formatDate(user?.lastLoginAt ?? null)}</dd>
          </dl>
        </div>
      )}

      <div className={styles.card}>
        <h2>Смена пароля</h2>
        {forced ? null : <p className={styles.muted}>Пароль можно сменить в любой момент.</p>}

        {error ? (
          <div className="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}
        {done && !forced ? <div className={styles.done}>Пароль обновлён.</div> : null}

        <div className="field">
          <label htmlFor="old-password">Текущий пароль</label>
          <input
            id="old-password"
            type="password"
            value={oldPassword}
            autoComplete="current-password"
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">Новый пароль</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            autoComplete="new-password"
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <span className="hint">Не менее 8 символов.</span>
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Повторите пароль</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <button className="btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Сохранение…" : forced ? "Сменить пароль" : "Обновить пароль"}
        </button>
      </div>
    </div>
  );
}
