import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export const PermissionsService = {
  list(): Promise<Result<string[]>> {
    return invokeCommand<string[]>("permissionsList");
  },
};
