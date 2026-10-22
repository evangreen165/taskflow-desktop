import { create } from "zustand";

import { NotificationsService, type Notification } from "@/services/notifications";
import { StorageService } from "@/services/storage";
import { useAuthStore } from "@/stores/useAuthStore";

interface NotificationState {
  items: Notification[];
  loading: boolean;
  /** Refreshes the list; used on mount and by the 30s poll. */
  fetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  loading: false,

  fetch: async () => {
    set((state) => ({ loading: state.items.length === 0 }));
    const result = await NotificationsService.list();
    if (result.ok) {
      set({ items: result.value, loading: false });
    } else {
      set({ loading: false });
    }
  },

  markRead: async (id) => {
    // Optimistic: the bell dot should clear immediately.
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    }));
    const result = await NotificationsService.markRead(id);
    if (!result.ok) {
      // Re-sync with the backend on failure.
      const refreshed = await NotificationsService.list();
      if (refreshed.ok) {
        set({ items: refreshed.value });
      }
    }
  },

  markAllRead: async () => {
    set((state) => ({
      items: state.items.map((item) => ({ ...item, isRead: true })),
    }));
    const result = await NotificationsService.markAllRead();
    if (!result.ok) {
      const refreshed = await NotificationsService.list();
      if (refreshed.ok) {
        set({ items: refreshed.value });
      }
    }
  },
}));

let notificationTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Subscribes to `workspace://fs-event`: a change to
 * `notifications/{currentUserId}.json` (written by another PC or user) triggers
 * an immediate refetch instead of waiting for the 30 s poll. Returns an
 * unsubscribe function.
 */
export function setupNotificationWatcher(): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  void StorageService.watch((batch) => {
    if (disposed) {
      return;
    }
    const session = useAuthStore.getState().session;
    if (!session) {
      return;
    }
    const ownFile = `notifications/${session.user.id}.json`;
    if (!batch.events.some((event) => event.path === ownFile)) {
      return;
    }
    if (notificationTimer !== null) {
      clearTimeout(notificationTimer);
    }
    notificationTimer = setTimeout(() => {
      notificationTimer = null;
      void useNotificationStore.getState().fetch();
    }, 150);
  }).then((fn) => {
    if (disposed) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    disposed = true;
    unlisten?.();
    if (notificationTimer !== null) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
  };
}
