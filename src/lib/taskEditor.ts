import type {
  ChecklistItem,
  Comment,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskPayload,
} from "@/services/tasks";

/** Editable projection of a task used by the detail panel. */
export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignees: string[];
  checklist: ChecklistItem[];
  comments: Comment[];
}

export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Converts a stored ISO due value to a `datetime-local` input value
 * (`YYYY-MM-DDTHH:mm`, local time). Date-only legacy values map to `T00:00`.
 */
export function toDateTimeInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso}T00:00`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Converts a `datetime-local` value (local, `YYYY-MM-DDTHH:mm`) to the full ISO
 * string that is persisted, so the selected time is not truncated.
 */
export function fromDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

export function taskToDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: toDateTimeInput(task.dueDate),
    assignees: [...task.assignees],
    checklist: task.checklist.map((item) => ({ ...item })),
    comments: task.comments.map((comment) => ({ ...comment })),
  };
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function buildUpdatePatch(draft: TaskDraft, base: TaskDraft): UpdateTaskPayload {
  const patch: UpdateTaskPayload = {};
  if (draft.title !== base.title) {
    patch.title = draft.title;
  }
  if (draft.description !== base.description) {
    patch.description = draft.description;
  }
  if (draft.priority !== base.priority) {
    patch.priority = draft.priority;
  }
  if (draft.dueDate !== base.dueDate) {
    patch.dueDate = draft.dueDate;
  }
  if (!sameStrings(draft.assignees, base.assignees)) {
    patch.assignees = draft.assignees;
  }
  if (JSON.stringify(draft.checklist) !== JSON.stringify(base.checklist)) {
    patch.checklist = draft.checklist;
  }
  if (JSON.stringify(draft.comments) !== JSON.stringify(base.comments)) {
    patch.comments = draft.comments;
  }
  return patch;
}

export function statusChanged(draft: TaskDraft, base: TaskDraft): boolean {
  return draft.status !== base.status;
}

export function hasChanges(draft: TaskDraft, base: TaskDraft): boolean {
  return statusChanged(draft, base) || Object.keys(buildUpdatePatch(draft, base)).length > 0;
}
