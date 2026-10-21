import { useEffect } from "react";
import { Navigate } from "react-router-dom";

import { useAppStore } from "@/stores/useAppStore";

/**
 * Root route: runs `boot()` once and redirects by app phase.
 * - no saved folder / first run → /onboarding
 * - saved workspace, no session (memory-only) → /login
 * - saved workspace + session → /app/tasks
 */
export default function BootGate(): JSX.Element {
  const phase = useAppStore((s) => s.phase);
  const error = useAppStore((s) => s.error);
  const boot = useAppStore((s) => s.boot);
  const chooseDifferentFolder = useAppStore((s) => s.chooseDifferentFolder);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (phase === "loading") {
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Загрузка TaskFlow…
      </div>
    );
  }

  if (phase === "workspace-error") {
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Не удалось открыть workspace</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 18 }}>
            {error?.message ??
              "Сохранённая папка недоступна. Проверьте подключение к SMB-шаре или выберите другую папку."}
          </p>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void chooseDifferentFolder()}
          >
            Выбрать другую папку
          </button>
        </div>
      </div>
    );
  }

  if (phase === "onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (phase === "login") {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/app/dashboard" replace />;
}
