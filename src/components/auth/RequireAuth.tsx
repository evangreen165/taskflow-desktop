import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Guards the /app subtree: requires a session, and redirects any route other
 * than /app/profile to /app/profile while the password change is pending.
 *
 * On a WebView reload (F5) the Zustand store is wiped while the Rust session
 * is still alive, so before bouncing to /login we ask the backend to restore
 * the session via `authRefreshSession`.
 */
export default function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();
  const [checking, setChecking] = useState(() => session === null);

  useEffect(() => {
    if (session) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void useAuthStore
      .getState()
      .refreshSession()
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (checking) {
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

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.mustChangePassword && location.pathname !== "/app/profile") {
    return <Navigate to="/app/profile" replace />;
  }
  return <>{children}</>;
}
