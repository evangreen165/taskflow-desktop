import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { can } from "@/lib/permissions";
import { useAuthStore } from "@/stores/useAuthStore";

import NoAccess from "./NoAccess";

/** Gates a route by permission; renders `fallback` (default: NoAccess). */
export default function RequirePerm({
  perm,
  fallback,
  children,
}: {
  perm: string;
  fallback?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const session = useAuthStore((s) => s.session);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.mustChangePassword) {
    return <Navigate to="/app/profile" replace />;
  }
  if (!can(session.permissions, perm)) {
    return <>{fallback ?? <NoAccess />}</>;
  }
  return <>{children}</>;
}
