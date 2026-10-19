import type { Task, TaskPriority } from "@/services/tasks";

export interface TaskFilterState {
  search: string;
  priority: TaskPriority | null;
  assigneeId: string | null;
}

export const EMPTY_TASK_FILTER: TaskFilterState = {
  search: "",
  priority: null,
  assigneeId: null,
};

/** Client-side filtering: search + priority + assignee. */
export function filterTasks(tasks: readonly Task[], filter: TaskFilterState): Task[] {
  const query = filter.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filter.priority !== null && task.priority !== filter.priority) {
      return false;
    }
    if (filter.assigneeId !== null && !task.assignees.includes(filter.assigneeId)) {
      return false;
    }
    if (query !== "") {
      const haystack = `${task.title} ${task.description}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function isFilterActive(filter: TaskFilterState): boolean {
  return filter.search.trim() !== "" || filter.priority !== null || filter.assigneeId !== null;
}
