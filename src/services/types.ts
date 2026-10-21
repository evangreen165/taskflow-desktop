/** Shared DTOs mirrored from the Rust IPC surface (v2). */

export interface WorkspaceInfo {
  path: string;
  name: string;
  workspaceId: string;
  schemaVersion: number;
  createdAt: string;
}

export interface FolderInspection {
  path: string;
  exists: boolean;
  isDir: boolean;
  isWorkspace: boolean;
  workspaceName: string | null;
  schemaVersion: number | null;
  hasUsers: boolean;
}

export interface UserInfo {
  id: string;
  login: string;
  displayName: string;
  email: string | null;
  roleId: string;
  avatarColor: string;
  avatarSha256: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface RoleView {
  id: string;
  name: string;
  color: string;
}

export interface SessionView {
  user: UserInfo;
  role: RoleView;
  permissions: string[];
  loginAt: string;
  mustChangePassword: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  color: string;
  empty?: boolean;
}

export interface UserPatch {
  displayName?: string;
  email?: string | null;
  roleId?: string;
  avatarColor?: string;
  isActive?: boolean;
  avatarSha256?: string | null;
}

export interface RolePatch {
  name?: string;
  description?: string;
  color?: string;
  permissions?: string[];
}
