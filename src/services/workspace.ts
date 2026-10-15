import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface WorkspaceInfo {
  path: string;
  name: string;
  workspaceId: string;
  schemaVersion: number;
  createdAt: string;
}

export interface UserInfo {
  login: string;
  name: string;
  role: string;
  createdAt: string;
  avatarColor: string;
}

export interface SessionInfo {
  workspace: WorkspaceInfo | null;
  user: UserInfo | null;
  machineId: string;
}

export interface FolderInspection {
  path: string;
  exists: boolean;
  isDir: boolean;
  isWorkspace: boolean;
  workspaceName: string | null;
  schemaVersion: number | null;
}

export const WorkspaceService = {
  /** Creates a workspace at an absolute path and activates it. */
  initWorkspace(path: string, name: string): Promise<Result<WorkspaceInfo>> {
    return invokeCommand<WorkspaceInfo>("initWorkspace", { path, name });
  },

  /** Validates and activates an existing workspace. */
  activateWorkspace(path: string): Promise<Result<WorkspaceInfo>> {
    return invokeCommand<WorkspaceInfo>("activateWorkspace", { path });
  },

  /** Inspects a candidate folder without activating it. */
  inspectFolder(path: string): Promise<Result<FolderInspection>> {
    return invokeCommand<FolderInspection>("inspectFolder", { path });
  },

  getSession(): Promise<Result<SessionInfo>> {
    return invokeCommand<SessionInfo>("getSession");
  },
};

export const AuthService = {
  createAdmin(login: string, password: string, fullName: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("createAdmin", { login, password, fullName });
  },

  login(login: string, password: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("login", { login, password });
  },

  logout(): Promise<Result<void>> {
    return invokeCommand<void>("logout");
  },
};
