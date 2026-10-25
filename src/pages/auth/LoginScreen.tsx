import { useState } from "react";
import { useLocation } from "react-router-dom";

import styles from "@/components/onboarding/Onboarding.module.css";
import { appNavigate } from "@/lib/navigate";
import { AuthService } from "@/services/auth";
import { ConfigService } from "@/services/config";
import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";

export default function LoginScreen(): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const chooseDifferentFolder = useAppStore((s) => s.chooseDifferentFolder);
  const login = useAuthStore((s) => s.login);
  const location = useLocation();

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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
    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    // "Запомнить меня": keep a machine-local token so the next launch can
    // auto-login without a password. Only overwrite an existing token when a
    // new one was actually issued.
    if (rememberMe) {
      console.log("[login] remember-me checked:", rememberMe);
      const token = await AuthService.loginRemember(loginName.trim(), password);
      if (token.ok) {
        console.log("Saving token:", token.value.token);
        await ConfigService.setRememberToken(token.value.token);
      } else {
        console.warn("[login] loginRemember failed:", token.error.code, token.error.message);
      }
    }
    setBusy(false);
    const from = (location.state as { from?: string } | null)?.from;
    appNavigate(from && from.startsWith("/app") ? from : "/app/dashboard", { replace: true });
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

        <label className={styles.rememberRow}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Запомнить меня на этом компьютере</span>
        </label>

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
