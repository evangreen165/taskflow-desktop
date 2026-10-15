import { create } from "zustand";

import { AppError } from "@/lib/errors";
import { ConfigService } from "@/services/config";
import { StorageService } from "@/services/storage";
import { WorkspaceService, type WorkspaceInfo } from "@/services/workspace";

import { useAuthStore } from "./useAuthStore";

export type AppPhase = "loading" | "onboarding" | "login" | "workspace" | "workspace-error";

interface AppState {
  phase: AppPhase;
  workspace: WorkspaceInfo | null;
  machineId: string | null;
  error: AppError | null;
  /** Boots the app: restores the saved workspace path or shows onboarding. */
  boot: () => Promise<void>;
  /** Persists the chosen workspace and switches to the workspace phase. */
  activateAndPersist: (workspace: WorkspaceInfo) => Promise<void>;
  /** Called after a successful login to enter the workspace. */
  completeLogin: () => void;
  /** Returns to the login screen (used on logout). */
  requireLogin: () => void;
  /** Forgets the saved path and returns to onboarding. */
  chooseDifferentFolder: () => Promise<void>;
}

async function startWatcherSafely(): Promise<void> {
  await StorageService.startWatcher();
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

    const session = await WorkspaceService.getSession();
    const user = session.ok ? session.value.user : null;
    await startWatcherSafely();
    useAuthStore.getState().setUser(user);
    set({
      phase: user ? "workspace" : "login",
      workspace: activated.value,
      machineId: session.ok ? session.value.machineId : null,
      error: null,
    });
  },

  activateAndPersist: async (workspace) => {
    await ConfigService.setWorkspacePath(workspace.path);
    await startWatcherSafely();
    const session = await WorkspaceService.getSession();
    useAuthStore.getState().setUser(session.ok ? session.value.user : null);
    set({
      phase: "workspace",
      workspace,
      machineId: session.ok ? session.value.machineId : null,
      error: null,
    });
  },

  completeLogin: () => {
    set({ phase: "workspace", error: null });
  },

  requireLogin: () => {
    set({ phase: "login", error: null });
  },

  chooseDifferentFolder: async () => {
    try {
      await ConfigService.clear();
    } finally {
      useAuthStore.getState().setUser(null);
      set({ phase: "onboarding", workspace: null, error: null });
    }
  },
}));
