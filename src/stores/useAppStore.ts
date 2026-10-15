import { create } from "zustand";

import { AppError } from "@/lib/errors";
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
}

async function startWatcherSafely(): Promise<void> {
  await StorageService.startWatcher();
}

/** Sessions are in-memory, so a fresh boot always lands on /login. */
async function resolvePhase(): Promise<AppPhase> {
  await useAuthStore.getState().refreshSession();
  return useAuthStore.getState().session ? "workspace" : "login";
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
    }
  },
}));
