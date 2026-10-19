import { create } from "zustand";

import type { AppError } from "@/lib/errors";
import { TasksService, type Task, type TaskStatus } from "@/services/tasks";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** Loads all visible tasks (`tasksList` with an empty filter). */
  fetchTasks: () => Promise<void>;
  addTask: (task: Task) => void;
  /** Replaces one task in the list with the server-confirmed version. */
  replaceTask: (task: Task) => void;
  /**
   * Optimistically moves a task to `status`, then persists it. On failure the
   * previous list is restored and the error is returned for a toast.
   */
  moveTask: (id: string, status: TaskStatus, currentVersion: number) => Promise<AppError | null>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    const result = await TasksService.list({});
    if (result.ok) {
      set({ tasks: result.value, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  addTask: (task) => {
    set((state) => ({ tasks: [task, ...state.tasks] }));
  },

  replaceTask: (task) => {
    set((state) => ({
      tasks: state.tasks.map((item) => (item.id === task.id ? task : item)),
    }));
  },

  moveTask: async (id, status, currentVersion) => {
    const previous = get().tasks;
    set({
      tasks: previous.map((task) => (task.id === id ? { ...task, status } : task)),
    });

    const result = await TasksService.changeStatus(id, status, currentVersion);
    if (!result.ok) {
      set({ tasks: previous });
      return result.error;
    }

    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? result.value : task)),
    }));
    return null;
  },
}));
