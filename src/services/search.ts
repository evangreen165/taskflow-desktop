import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { NoteStatus } from "@/services/notes";
import type { TaskPriority, TaskStatus } from "@/services/tasks";

export interface TaskSearchResult {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  spaceId: string;
  spaceName: string;
}

export interface NoteSearchResult {
  id: string;
  title: string;
  category: string;
  status: NoteStatus;
  spaceId: string;
  spaceName: string;
}

export interface GlobalSearchResults {
  tasks: TaskSearchResult[];
  notes: NoteSearchResult[];
}

export const SearchService = {
  /** Searches tasks and notes; omit `spaceId` to search every accessible space. */
  global(query: string, spaceId?: string): Promise<Result<GlobalSearchResults>> {
    const args: Record<string, unknown> = { query };
    if (spaceId) {
      args.spaceId = spaceId;
    }
    return invokeCommand<GlobalSearchResults>("globalSearch", args);
  },
};
