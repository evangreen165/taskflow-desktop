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
};
