import { create } from "zustand";

import { NotificationsService, type Notification } from "@/services/notifications";

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
