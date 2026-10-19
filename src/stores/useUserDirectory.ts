import { create } from "zustand";

import { UsersService, type UserSummary } from "@/services/users";

interface DirectoryState {
  users: Record<string, UserSummary>;
  /** All active users (for pickers). */
  all: UserSummary[];
  /** Resolves and caches summaries for any ids not already known. */
  ensure: (ids: string[]) => Promise<void>;
  /** Loads the active-user directory once. */
  loadAll: () => Promise<void>;
}

export const useUserDirectory = create<DirectoryState>((set, get) => ({
  users: {},
  all: [],

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

  loadAll: async () => {
    if (get().all.length > 0) {
      return;
    }
    const result = await UsersService.directory();
    if (!result.ok) {
      return;
    }
    set((state) => {
      const next = { ...state.users };
      for (const user of result.value) {
        next[user.id] = user;
      }
      return { all: result.value, users: next };
    });
  },
}));
