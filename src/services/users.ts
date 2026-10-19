import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { UserInfo, UserPatch } from "@/services/types";

/** Non-sensitive projection used for assignee avatars. */
export interface UserSummary {
  id: string;
  displayName: string;
  avatarColor: string;
}

export const UsersService = {
  list(): Promise<Result<UserInfo[]>> {
    return invokeCommand<UserInfo[]>("usersList");
  },

  /** Resolves display names/avatar colors for the given user ids. */
  summaries(ids: string[]): Promise<Result<UserSummary[]>> {
    return invokeCommand<UserSummary[]>("usersSummaries", { ids });
  },

  /** Active-user directory for pickers (authenticated, non-sensitive). */
  directory(): Promise<Result<UserSummary[]>> {
    return invokeCommand<UserSummary[]>("usersDirectory");
  },

  update(id: string, patch: UserPatch): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("usersUpdate", { id, patch });
  },

  deactivate(id: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("usersDeactivate", { id });
  },
};
