import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { Role, RolePatch } from "@/services/types";

export const RolesService = {
  list(): Promise<Result<Role[]>> {
    return invokeCommand<Role[]>("rolesList");
  },

  create(
    id: string,
    name: string,
    description: string,
    color: string,
    permissions: string[],
  ): Promise<Result<Role>> {
    return invokeCommand<Role>("rolesCreate", { id, name, description, color, permissions });
  },

  update(id: string, patch: RolePatch): Promise<Result<Role>> {
    return invokeCommand<Role>("rolesUpdate", { id, patch });
  },

  delete(id: string): Promise<Result<void>> {
    return invokeCommand<void>("rolesDelete", { id });
  },
};
