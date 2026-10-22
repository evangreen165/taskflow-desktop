import { StorageService } from "@/services/storage";
import { TasksService } from "@/services/tasks";
import { useSpaceStore } from "@/stores/useSpaceStore";
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
  const spaceId = useSpaceStore.getState().currentSpaceId;
  if (!spaceId) {
    return;
  }
  const result = await TasksService.list(spaceId, {});
  if (result.ok) {
    useTaskStore.getState().setTasksSilently(result.value);
  }
}

/**
 * Subscribes the board to `workspace://fs-event`: any change under the current
 * space's `spaces/{spaceId}/tasks/` (another machine or an external editor)
 * triggers a debounced, silent refetch. The legacy root-level `tasks/` path is
 * still accepted for older workspaces. Events produced by our own writes within
 * the quiet window are skipped to avoid redundant refetches.
 */
export function startTaskWatcher(): () => void {
  let disposed = false;
  void StorageService.watch((batch) => {
    if (disposed) {
      return;
    }
    const spaceId = useSpaceStore.getState().currentSpaceId;
    const relevant = batch.events.some(
      (event) =>
        (spaceId !== null && event.path.startsWith(`spaces/${spaceId}/tasks/`)) ||
        event.path.startsWith("tasks/"),
    );
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
