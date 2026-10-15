import { useState } from "react";

import styles from "@/components/onboarding/Onboarding.module.css";
import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Shown when a workspace is active but no user is logged in (e.g. after a
 * restart). Authentication is required before the workspace is usable.
 */
export default function LoginScreen(): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const completeLogin = useAppStore((s) => s.completeLogin);
  const chooseDifferentFolder = useAppStore((s) => s.chooseDifferentFolder);
  const login = useAuthStore((s) => s.login);

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!loginName.trim() || !password) {
      setError("Введите логин и пароль.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await login(loginName.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    completeLogin();
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.mark}>T</div>
          <div className={styles.brandText}>
            <h1>TaskFlow</h1>
            <span>{workspace?.name ?? "workspace"}</span>
          </div>
        </div>

        <div className={styles.title}>Вход</div>
        <div className={styles.subtitle}>
          Workspace открыт из <b>{workspace?.path ?? "—"}</b>. Войдите, чтобы продолжить.
        </div>

        {error ? (
          <div className="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="login">Логин</label>
          <input
            id="login"
            type="text"
            value={loginName}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setLoginName(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submit();
              }
            }}
          />
        </div>

        <div className={styles.actions}>
          <button className="btn-ghost" type="button" onClick={() => void chooseDifferentFolder()}>
            Другая папка
          </button>
          <div className={styles.spacer} />
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Вход…" : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
