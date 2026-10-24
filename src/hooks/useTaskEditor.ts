import { useEffect, useRef, useState } from "react";

import type { AppError } from "@/lib/errors";
import {
  buildUpdatePatch,
  fromDateInput,
  hasChanges,
  statusChanged,
  taskToDraft,
  type TaskDraft,
} from "@/lib/taskEditor";
import {
  TasksService,
  type ChecklistItem,
  type Comment,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/services/tasks";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTaskStore } from "@/stores/useTaskStore";

const DEBOUNCE_MS = 800;

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** VERSION_CONFLICT errors carry the current server task in `details`. */
export function parseConflictTask(error: AppError): Task | null {
  if (!error.details) {
    return null;
  }
  try {
    return JSON.parse(error.details) as Task;
  } catch {
    return null;
  }
}

export interface UseTaskEditorResult {
  draft: TaskDraft;
  saving: boolean;
  error: string | null;
  conflictTask: Task | null;
  /** True when an external change arrived while there were unsaved edits. */
  externalUpdate: boolean;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setStatus: (value: TaskStatus) => void;
  setPriority: (value: TaskPriority) => void;
  setDueDate: (value: string) => void;
  setAssignees: (value: string[]) => void;
  toggleChecklistItem: (id: string) => void;
  addChecklistItem: (text: string) => void;
  updateChecklistItem: (id: string, text: string) => void;
  removeChecklistItem: (id: string) => void;
  addComment: (text: string) => void;
  flush: () => Promise<void>;
  reloadCurrent: () => void;
  dismissConflict: () => void;
  /** Adopts the latest server version (from the store) discarding local edits. */
  adoptExternal: () => void;
}

/**
 * Owns the draft state of the detail panel and persists every change through
 * `tasksChangeStatus`/`tasksUpdate` with optimistic versioning. Debounces
 * title/description; saves selects, checklist and comments immediately. On
 * `VERSION_CONFLICT` autosave stops and the modal data is exposed; on other
 * errors the draft is reverted to the last server-confirmed state.
 */
export function useTaskEditor(task: Task, spaceId: string): UseTaskEditorResult {
  const initial = useRef<TaskDraft>(taskToDraft(task));
  const [draft, setDraft] = useState<TaskDraft>(initial.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictTask, setConflictTask] = useState<Task | null>(null);
  const [externalUpdate, setExternalUpdate] = useState(false);

  const draftRef = useRef<TaskDraft>(initial.current);
  const baseRef = useRef<TaskDraft>(initial.current);
  const versionRef = useRef<number>(task.version);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);

  // External task change (watcher refetch): adopt it when the draft is clean,
  // otherwise notify without clobbering the draft. Our own saves set
  // `versionRef` before `replaceTask`, so they never trip this.
  useEffect(() => {
    if (conflictRef.current) {
      return;
    }
    if (task.version === versionRef.current) {
      return;
    }
    const nextBase = taskToDraft(task);
    if (hasChanges(draftRef.current, baseRef.current)) {
      setExternalUpdate(true);
    } else {
      baseRef.current = nextBase;
      versionRef.current = task.version;
      draftRef.current = nextBase;
      setDraft(nextBase);
      setExternalUpdate(false);
    }
  }, [task]);

  function clearTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleSave(): void {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, DEBOUNCE_MS);
  }

  function applyDraft(next: TaskDraft, immediate: boolean): void {
    draftRef.current = next;
    setDraft(next);
    if (conflictRef.current) {
      return;
    }
    if (immediate) {
      void performSave();
    } else {
      scheduleSave();
    }
  }

  function handleError(appError: AppError): void {
    if (appError.code === "VERSION_CONFLICT") {
      conflictRef.current = true;
      setConflictTask(parseConflictTask(appError));
      return;
    }
    const current = useTaskStore.getState().tasks.find((item) => item.id === task.id) ?? task;
    const reverted = taskToDraft(current);
    draftRef.current = reverted;
    baseRef.current = reverted;
    versionRef.current = current.version;
    setDraft(reverted);
    setError(appError.message);
  }

  async function doSave(): Promise<void> {
    const draftNow = draftRef.current;
    const baseNow = baseRef.current;
    const patch = buildUpdatePatch(draftNow, baseNow);
    const nextStatus = statusChanged(draftNow, baseNow) ? draftNow.status : undefined;
    if (nextStatus === undefined && Object.keys(patch).length === 0) {
      return;
    }

    setSaving(true);
    setError(null);
    let currentVersion = versionRef.current;
    try {
      if (nextStatus !== undefined) {
        const result = await TasksService.changeStatus(
          spaceId,
          task.id,
          nextStatus,
          currentVersion,
        );
        if (!result.ok) {
          handleError(result.error);
          return;
        }
        currentVersion = result.value.version;
        versionRef.current = currentVersion;
        baseRef.current = taskToDraft(result.value);
        useTaskStore.getState().replaceTask(result.value);
      }
      if (Object.keys(patch).length > 0) {
        const result = await TasksService.update(spaceId, task.id, patch, currentVersion);
        if (!result.ok) {
          handleError(result.error);
          return;
        }
        versionRef.current = result.value.version;
        baseRef.current = taskToDraft(result.value);
        useTaskStore.getState().replaceTask(result.value);
      }
    } finally {
      setSaving(false);
    }
  }

  async function performSave(): Promise<void> {
    if (conflictRef.current) {
      return;
    }
    if (inflightRef.current !== null) {
      pendingRef.current = true;
      await inflightRef.current;
      return;
    }
    const run = doSave();
    inflightRef.current = run;
    try {
      await run;
    } finally {
      inflightRef.current = null;
    }
    if (pendingRef.current && !conflictRef.current) {
      pendingRef.current = false;
      await performSave();
    }
  }

  function flush(): Promise<void> {
    clearTimer();
    return performSave();
  }

  function setTitle(value: string): void {
    applyDraft({ ...draftRef.current, title: value }, false);
  }

  function setDescription(value: string): void {
    applyDraft({ ...draftRef.current, description: value }, false);
  }

  function setStatus(value: TaskStatus): void {
    applyDraft({ ...draftRef.current, status: value }, true);
  }

  function setPriority(value: TaskPriority): void {
    applyDraft({ ...draftRef.current, priority: value }, true);
  }

  function setDueDate(value: string): void {
    applyDraft({ ...draftRef.current, dueDate: fromDateInput(value) }, true);
  }

  function setAssignees(value: string[]): void {
    applyDraft({ ...draftRef.current, assignees: value }, true);
  }

  function toggleChecklistItem(id: string): void {
    applyDraft(
      {
        ...draftRef.current,
        checklist: draftRef.current.checklist.map((item) =>
          item.id === id ? { ...item, done: !item.done } : item,
        ),
      },
      true,
    );
  }

  function addChecklistItem(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const item: ChecklistItem = { id: newId("cl"), text: trimmed, done: false };
    applyDraft({ ...draftRef.current, checklist: [...draftRef.current.checklist, item] }, true);
  }

  function updateChecklistItem(id: string, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    applyDraft(
      {
        ...draftRef.current,
        checklist: draftRef.current.checklist.map((item) =>
          item.id === id ? { ...item, text: trimmed } : item,
        ),
      },
      true,
    );
  }

  function removeChecklistItem(id: string): void {
    applyDraft(
      {
        ...draftRef.current,
        checklist: draftRef.current.checklist.filter((item) => item.id !== id),
      },
      true,
    );
  }

  function addComment(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const authorId = useAuthStore.getState().session?.user.id ?? "unknown";
    const comment: Comment = {
      id: newId("cm"),
      authorId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    applyDraft({ ...draftRef.current, comments: [...draftRef.current.comments, comment] }, true);
  }

  function reloadCurrent(): void {
    const current = conflictTask;
    if (!current) {
      setConflictTask(null);
      return;
    }
    const next = taskToDraft(current);
    draftRef.current = next;
    baseRef.current = next;
    versionRef.current = current.version;
    conflictRef.current = false;
    setDraft(next);
    setConflictTask(null);
    setExternalUpdate(false);
    setError(null);
    useTaskStore.getState().replaceTask(current);
  }

  function dismissConflict(): void {
    setConflictTask(null);
  }

  function adoptExternal(): void {
    const next = taskToDraft(task);
    draftRef.current = next;
    baseRef.current = next;
    versionRef.current = task.version;
    setDraft(next);
    setExternalUpdate(false);
    setError(null);
  }

  return {
    draft,
    saving,
    error,
    conflictTask,
    externalUpdate,
    setTitle,
    setDescription,
    setStatus,
    setPriority,
    setDueDate,
    setAssignees,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    addComment,
    flush,
    reloadCurrent,
    dismissConflict,
    adoptExternal,
  };
}
