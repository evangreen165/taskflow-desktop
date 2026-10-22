import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface Space {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  ownerId: string;
  members: string[];
}

/** Minimal member projection returned by `spacesGetMembers`. */
export interface SpaceMember {
  id: string;
  login: string;
  displayName: string;
  avatarColor: string;
  avatarSha256: string | null;
}

export const SpacesService = {
  list(): Promise<Result<Space[]>> {
    return invokeCommand<Space[]>("spacesList");
  },

  get(id: string): Promise<Result<Space>> {
    return invokeCommand<Space>("spacesGet", { id });
  },

  /** Active members of a space, for the assignee picker and @mentions. */
  getMembers(id: string): Promise<Result<SpaceMember[]>> {
    return invokeCommand<SpaceMember[]>("spacesGetMembers", { spaceId: id });
  },

  create(name: string, description: string): Promise<Result<Space>> {
    return invokeCommand<Space>("spacesCreate", { name, description });
  },

  update(id: string, name: string, description: string, members: string[]): Promise<Result<Space>> {
    return invokeCommand<Space>("spacesUpdate", { id, name, description, members });
  },

  delete(id: string): Promise<Result<void>> {
    return invokeCommand<void>("spacesDelete", { id });
  },
};
