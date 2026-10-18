import { create } from "zustand";

import type { Result } from "@/lib/errors";
import { AuthService } from "@/services/auth";
import { StorageService } from "@/services/storage";
import type { SessionView } from "@/services/types";

interface AuthState {
  session: SessionView | null;
  setSession: (session: SessionView | null) => void;
  login: (login: string, password: string) => Promise<Result<SessionView>>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<Result<SessionView>>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,

  setSession: (session) => {
    set({ session });
  },

  login: async (login, password) => {
    const result = await AuthService.login(login, password);
    if (result.ok) {
      set({ session: result.value });
    }
    return result;
  },

  logout: async () => {
    await AuthService.logout();
    set({ session: null });
  },

  refreshSession: async () => {
    const result = await AuthService.refreshSession();
    if (result.ok) {
      set({ session: result.value });
    } else if (result.error.code === "AUTH_REQUIRED") {
      set({ session: null });
    }
  },

  changePassword: async (oldPassword, newPassword) => {
    const result = await AuthService.changePassword(oldPassword, newPassword);
    if (result.ok) {
      set({ session: result.value });
    }
    return result;
  },
}));

/**
 * Wires the auth store to the workspace file watcher: a change to the current
 * user's own file or to the current role file triggers a session refresh
 * (debounced 300 ms). Covers another machine editing/deleting the user's role.
 */
let watcherTimer: ReturnType<typeof setTimeout> | null = null;

export function setupAuthWatcher(): void {
  void StorageService.watch((batch) => {
    const session = useAuthStore.getState().session;
    if (!session) {
      return;
    }
    const relevant = batch.events.some(
      (event) =>
        event.path === `users/${session.user.login}.json` ||
        event.path === `roles/${session.role.id}.json`,
    );
    if (!relevant) {
      return;
    }
    if (watcherTimer !== null) {
      clearTimeout(watcherTimer);
    }
    watcherTimer = setTimeout(() => {
      void useAuthStore.getState().refreshSession();
    }, 300);
  });
}
