import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export type TaskStatus = "new" | "in_progress" | "review" | "done" | "rejected";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

/** Mirrors the Rust `Task` model (camelCase JSON). */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: string[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  tags: string[];
  checklist: ChecklistItem[];
  comments: Comment[];
  attachments: Attachment[];
  version: number;
  watchers: string[];
  projectId: string | null;
  /** Set only in cross-space dashboard responses. */
  spaceId: string | null;
  spaceName: string | null;
}

export interface TaskFilter {
  projectId?: string;
  status?: TaskStatus;
  assigneeId?: string;
  /** Inclusive `YYYY-MM-DD` range on `dueDate`. */
  startDate?: string;
  endDate?: string;
  /** `false` returns only tasks without a due date, `true` only with one. */
  hasDueDate?: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignees?: string[];
  dueDate?: string | null;
  tags?: string[];
  checklist?: ChecklistItem[];
  watchers?: string[];
  projectId?: string | null;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  assignees?: string[];
  dueDate?: string | null;
  tags?: string[];
  checklist?: ChecklistItem[];
  comments?: Comment[];
  watchers?: string[];
  projectId?: string | null;
}

export const TasksService = {
  list(spaceId: string, filter: TaskFilter = {}): Promise<Result<Task[]>> {
    return invokeCommand<Task[]>("tasksList", { spaceId, filter });
  },

  get(spaceId: string, id: string): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksGet", { spaceId, id });
  },

  create(spaceId: string, payload: CreateTaskPayload): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksCreate", { spaceId, payload });
  },

  update(
    spaceId: string,
    id: string,
    patch: UpdateTaskPayload,
    version: number,
  ): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksUpdate", {
      spaceId,
      id,
      patch,
      expectedVersion: version,
    });
  },

  changeStatus(
    spaceId: string,
    id: string,
    status: TaskStatus,
    version: number,
  ): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksChangeStatus", {
      spaceId,
      id,
      status,
      expectedVersion: version,
    });
  },

  delete(spaceId: string, id: string): Promise<Result<void>> {
    return invokeCommand<void>("tasksDelete", { spaceId, id });
  },

  /** Moves a task between spaces (requires access to both). */
  move(taskId: string, fromSpaceId: string, toSpaceId: string): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksMove", { taskId, fromSpaceId, toSpaceId });
  },
};
