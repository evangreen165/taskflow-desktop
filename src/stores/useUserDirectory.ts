import { create } from "zustand";

import { UsersService, type UserSummary } from "@/services/users";

interface DirectoryState {
  users: Record<string, UserSummary>;
  /** Resolves and caches summaries for any ids not already known. */
  ensure: (ids: string[]) => Promise<void>;
}

export const useUserDirectory = create<DirectoryState>((set, get) => ({
  users: {},
  ensure: async (ids) => {
    const known = get().users;
    const missing = Array.from(new Set(ids.filter((id) => known[id] === undefined)));
    if (missing.length === 0) {
      return;
    }
    const result = await UsersService.summaries(missing);
    if (!result.ok) {
      return;
    }
    set((state) => {
      const next = { ...state.users };
      for (const user of result.value) {
        next[user.id] = user;
      }
      return { users: next };
    });
  },
}));
