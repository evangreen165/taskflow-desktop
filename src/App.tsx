import { useEffect } from "react";

import LoginScreen from "@/components/auth/LoginScreen";
import Onboarding from "@/components/onboarding/Onboarding";
import WorkspacePage from "@/pages/WorkspacePage";
import { useAppStore } from "@/stores/useAppStore";

export default function App(): JSX.Element {
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
    return <Onboarding />;
  }

  if (phase === "login") {
    return <LoginScreen />;
  }

  return <WorkspacePage />;
}
