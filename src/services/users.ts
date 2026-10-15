import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { UserInfo, UserPatch } from "@/services/types";

export const UsersService = {
  list(): Promise<Result<UserInfo[]>> {
    return invokeCommand<UserInfo[]>("usersList");
  },

  update(id: string, patch: UserPatch): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("usersUpdate", { id, patch });
  },

  deactivate(id: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("usersDeactivate", { id });
  },
};
