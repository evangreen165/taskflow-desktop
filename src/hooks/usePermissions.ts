import { useMemo } from "react";

import { can } from "@/lib/permissions";
import type { RoleView, UserInfo } from "@/services/types";
import { useAuthStore } from "@/stores/useAuthStore";

export interface PermissionsHandle {
  can: (perm: string) => boolean;
  permissions: string[];
  role: RoleView | null;
  user: UserInfo | null;
}

/** Convenience accessor over the active session's permissions and role. */
export function usePermissions(): PermissionsHandle {
  const session = useAuthStore((s) => s.session);
  return useMemo<PermissionsHandle>(
    () => ({
      can: (perm: string) => (session ? can(session.permissions, perm) : false),
      permissions: session?.permissions ?? [],
      role: session?.role ?? null,
      user: session?.user ?? null,
    }),
    [session],
  );
}
