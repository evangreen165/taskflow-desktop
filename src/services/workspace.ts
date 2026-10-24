import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { FolderInspection, WorkspaceInfo } from "@/services/types";

export const WorkspaceService = {
  /** Creates a workspace at an absolute path and activates it. */
  initWorkspace(path: string, name: string): Promise<Result<WorkspaceInfo>> {
    return invokeCommand<WorkspaceInfo>("initWorkspace", { path, name });
  },

  /** Validates and activates an existing workspace (runs migration if needed). */
  activateWorkspace(path: string): Promise<Result<WorkspaceInfo>> {
    return invokeCommand<WorkspaceInfo>("activateWorkspace", { path });
  },

  /** Inspects a candidate folder without activating it. */
  inspectFolder(path: string): Promise<Result<FolderInspection>> {
    return invokeCommand<FolderInspection>("inspectFolder", { path });
  },

  /** Admin session lifetime in days (0 = never expire). */
  getSessionLifetime(): Promise<Result<number>> {
    return invokeCommand<number>("workspaceGetSessionLifetime");
  },

  /** Persists the admin session lifetime (days, 0 = never). `workspace.settings`. */
  setSessionLifetime(days: number): Promise<Result<number>> {
    return invokeCommand<number>("workspaceSetSessionLifetime", { days });
  },

  /** Import setting: auto-create a category from the source folder name. */
  getImportSettings(): Promise<Result<boolean>> {
    return invokeCommand<boolean>("workspaceGetImportSettings");
  },

  setImportSettings(value: boolean): Promise<Result<boolean>> {
    return invokeCommand<boolean>("workspaceSetImportSettings", { value });
  },
};
