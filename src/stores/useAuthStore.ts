import { create } from "zustand";

import type { Result } from "@/lib/errors";
import { AuthService, type UserInfo } from "@/services/workspace";

interface AuthState {
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
  login: (login: string, password: string) => Promise<Result<UserInfo>>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  setUser: (user) => {
    set({ user });
  },

  login: async (login, password) => {
    const result = await AuthService.login(login, password);
    if (result.ok) {
      set({ user: result.value });
    }
    return result;
  },

  logout: async () => {
    await AuthService.logout();
    set({ user: null });
  },
}));
