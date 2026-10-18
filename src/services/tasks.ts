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
}

export interface TaskFilter {
  projectId?: string;
  status?: TaskStatus;
  assigneeId?: string;
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
  watchers?: string[];
  projectId?: string | null;
}

export const TasksService = {
  list(filter: TaskFilter = {}): Promise<Result<Task[]>> {
    return invokeCommand<Task[]>("tasksList", { filter });
  },

  get(id: string): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksGet", { id });
  },

  create(payload: CreateTaskPayload): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksCreate", { payload });
  },

  update(id: string, patch: UpdateTaskPayload, version: number): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksUpdate", { id, patch, expectedVersion: version });
  },

  changeStatus(id: string, status: TaskStatus, version: number): Promise<Result<Task>> {
    return invokeCommand<Task>("tasksChangeStatus", {
      id,
      status,
      expectedVersion: version,
    });
  },

  delete(id: string): Promise<Result<void>> {
    return invokeCommand<void>("tasksDelete", { id });
  },
};
