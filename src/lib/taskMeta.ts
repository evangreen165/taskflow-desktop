import type { TaskPriority, TaskStatus } from "@/services/tasks";

export interface KanbanColumn {
  status: TaskStatus;
  label: string;
}

/** Column order for the board (matches the prototype). */
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { status: "new", label: "Новая" },
  { status: "in_progress", label: "В работе" },
  { status: "review", label: "На проверке" },
  { status: "done", label: "Готово" },
  { status: "rejected", label: "Отклонена" },
  { status: "trash", label: "На удаление" },
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function priorityColor(priority: TaskPriority): string {
  switch (priority) {
    case "low":
      return "#6b7280";
    case "medium":
      return "#3b82f6";
    case "high":
      return "#f59e0b";
    case "critical":
      return "#ef4444";
  }
}

export function statusLabel(status: TaskStatus): string {
  return KANBAN_COLUMNS.find((column) => column.status === status)?.label ?? status;
}

/** Short date like `18 окт.`; `null` for missing/invalid dates. */
export function formatDueDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return shortDate(date);
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

export interface DueDisplay {
  date: string;
  /** `null` for date-only values and local midnight (00:00). */
  time: string | null;
}

/**
 * Formats a due value for cards: date plus time when one was set. Date-only
 * legacy values (`YYYY-MM-DD`) and local 00:00 are treated as date-only.
 */
export function formatDueDateTime(iso: string | null): DueDisplay | null {
  if (!iso) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return { date: shortDate(date), time: null };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return {
    date: shortDate(date),
    time:
      hours === 0 && minutes === 0
        ? null
        : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

/** A task is overdue when its due date is in the past and it is not done. */
export function isOverdue(iso: string | null, status: TaskStatus): boolean {
  if (!iso || status === "done" || status === "trash") {
    return false;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getTime() < Date.now();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase();
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const AVATAR_COLORS = ["#5b5bd6", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

/** Deterministic fallback color when a user summary is not available yet. */
export function avatarColorFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? "#5b5bd6";
}
