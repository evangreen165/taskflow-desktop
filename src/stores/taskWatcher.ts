import { StorageService } from "@/services/storage";
import { TasksService } from "@/services/tasks";
import { useTaskStore } from "@/stores/useTaskStore";

const DEBOUNCE_MS = 300;
/** Events caused by our own writes within this window are ignored. */
const QUIET_MS = 800;

let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefetch(): void {
  if (refetchTimer !== null) {
    return;
  }
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    void refetch();
  }, DEBOUNCE_MS);
}

async function refetch(): Promise<void> {
  const result = await TasksService.list({});
  if (result.ok) {
    useTaskStore.getState().setTasksSilently(result.value);
  }
}

/**
 * Subscribes the board to `workspace://fs-event`: any change under `tasks/`
 * (another machine or an external editor) triggers a debounced, silent
 * refetch. Events produced by our own writes within the quiet window are
 * skipped to avoid redundant refetches. Returns an unsubscribe function.
 */
export function startTaskWatcher(): () => void {
  let disposed = false;
  void StorageService.watch((batch) => {
    if (disposed) {
      return;
    }
    const relevant = batch.events.some((event) => event.path.startsWith("tasks/"));
    if (!relevant) {
      return;
    }
    const state = useTaskStore.getState();
    if (Date.now() - state.lastWriteAt < QUIET_MS) {
      return;
    }
    scheduleRefetch();
  });
  return () => {
    disposed = true;
    if (refetchTimer !== null) {
      clearTimeout(refetchTimer);
      refetchTimer = null;
    }
  };
}
