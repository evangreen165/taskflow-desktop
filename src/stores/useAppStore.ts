import { create } from "zustand";

import { AppError } from "@/lib/errors";
import { appNavigate } from "@/lib/navigate";
import { AuthService } from "@/services/auth";
import { ConfigService } from "@/services/config";
import { StorageService } from "@/services/storage";
import type { WorkspaceInfo } from "@/services/types";
import { WorkspaceService } from "@/services/workspace";

import { useAuthStore } from "./useAuthStore";

export type AppPhase = "loading" | "onboarding" | "login" | "workspace" | "workspace-error";

interface AppState {
  phase: AppPhase;
  workspace: WorkspaceInfo | null;
  machineId: string | null;
  error: AppError | null;
  /** Boots the app: restores the saved workspace path or shows onboarding. */
  boot: () => Promise<void>;
  /** Persists the chosen workspace and switches into it. */
  activateAndPersist: (workspace: WorkspaceInfo) => Promise<void>;
  /** Forgets the saved path and returns to onboarding. */
  chooseDifferentFolder: () => Promise<void>;
  /**
   * Clears the in-memory session and returns to onboarding without touching
   * the saved path — used after the user has validated a new folder.
   */
  switchWorkspace: () => void;
}

async function startWatcherSafely(): Promise<void> {
  await StorageService.startWatcher();
}

/**
 * Resolves the phase after the workspace is active. First probes the in-memory
 * Rust session; if none exists, tries the machine-local "remember me" token
 * (`authAutoLogin`). A valid token restores the session. The token is cleared
 * only when the backend rejects it (TOKEN_INVALID / AUTH_FAILED) — transient
 * IO errors must not destroy a valid token.
 *
 * Uses the "quiet" auth probes: the global error handler would navigate to
 * /login on AUTH_REQUIRED and strand the user there despite a successful
 * auto-login.
 */
async function resolvePhase(): Promise<AppPhase> {
  const auth = useAuthStore.getState();
  const probe = await AuthService.refreshSessionQuiet();
  if (probe.ok) {
    auth.setSession(probe.value);
    return "workspace";
  }
  const token = await ConfigService.getRememberToken();
  if (!token) {
    console.log("[boot] no remember token -> login");
    return "login";
  }
  console.log("[boot] AutoLogin token:", token);
  const auto = await AuthService.autoLoginQuiet(token);
  if (auto.ok) {
    console.log(`[boot] auto-login OK: ${auto.value.user.login}`);
    auth.setSession(auto.value);
    return "workspace";
  }
  console.warn(`[boot] auto-login failed: ${auto.error.code} — ${auto.error.message}`);
  if (auto.error.code === "TOKEN_INVALID" || auto.error.code === "AUTH_FAILED") {
    await ConfigService.setRememberToken(null);
  }
  return "login";
}

export const useAppStore = create<AppState>((set) => ({
  phase: "loading",
  workspace: null,
  machineId: null,
  error: null,

  boot: async () => {
    set({ phase: "loading", error: null });
    let savedPath: string | null = null;
    try {
      savedPath = await ConfigService.getWorkspacePath();
    } catch (cause) {
      set({ phase: "onboarding", error: AppError.from(cause) });
      return;
    }

    if (!savedPath) {
      set({ phase: "onboarding" });
      return;
    }

    const activated = await WorkspaceService.activateWorkspace(savedPath);
    if (!activated.ok) {
      set({ phase: "workspace-error", error: activated.error });
      return;
    }

    await startWatcherSafely();
    const phase = await resolvePhase();
    set({ phase, workspace: activated.value, error: null });
  },

  activateAndPersist: async (workspace) => {
    await ConfigService.setWorkspacePath(workspace.path);
    await startWatcherSafely();
    const phase = await resolvePhase();
    set({ phase, workspace, error: null });
  },

  chooseDifferentFolder: async () => {
    try {
      await ConfigService.clear();
    } finally {
      useAuthStore.getState().setSession(null);
      set({ phase: "onboarding", workspace: null, error: null });
      // The route must change too: the caller may be on /login or /app, where
      // the phase change alone does not re-render the onboarding screen.
      appNavigate("/onboarding", { state: { autoPick: true } });
    }
  },

  switchWorkspace: () => {
    useAuthStore.getState().setSession(null);
    set({ phase: "onboarding", workspace: null, error: null });
  },
}));
