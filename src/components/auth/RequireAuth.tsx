import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Guards the /app subtree: requires a session, and redirects any route other
 * than /app/profile to /app/profile while the password change is pending.
 */
export default function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.mustChangePassword && location.pathname !== "/app/profile") {
    return <Navigate to="/app/profile" replace />;
  }
  return <>{children}</>;
}
