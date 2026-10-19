import { create } from "zustand";

import type { AppError } from "@/lib/errors";
import { TasksService, type Task, type TaskStatus } from "@/services/tasks";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last local task write (used to suppress own fs-events). */
  lastWriteAt: number;
  /** Loads all visible tasks (`tasksList` with an empty filter). */
  fetchTasks: () => Promise<void>;
  /** Replaces the list without touching `loading` (watcher refresh). */
  setTasksSilently: (tasks: Task[]) => void;
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
  lastWriteAt: 0,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    const result = await TasksService.list({});
    if (result.ok) {
      set({ tasks: result.value, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  setTasksSilently: (tasks) => {
    set({ tasks });
  },

  addTask: (task) => {
    set((state) => ({ tasks: [task, ...state.tasks], lastWriteAt: Date.now() }));
  },

  replaceTask: (task) => {
    set((state) => ({
      tasks: state.tasks.map((item) => (item.id === task.id ? task : item)),
      lastWriteAt: Date.now(),
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
      lastWriteAt: Date.now(),
    }));
    return null;
  },
}));
