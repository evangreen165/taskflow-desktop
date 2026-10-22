import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { can } from "@/lib/permissions";
import { useAuthStore } from "@/stores/useAuthStore";

import NoAccess from "./NoAccess";

/** Gates a route by permission; renders `fallback` (default: NoAccess). */
export default function RequirePerm({
  perm,
  anyOf,
  fallback,
  children,
}: {
  /** A single required permission. */
  perm?: string;
  /** Succeeds when the session has at least one of these permissions. */
  anyOf?: string[];
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
  const allowed = anyOf
    ? anyOf.some((item) => can(session.permissions, item))
    : perm
      ? can(session.permissions, perm)
      : true;
  if (!allowed) {
    return <>{fallback ?? <NoAccess />}</>;
  }
  return <>{children}</>;
}
