import { create } from "zustand";

export type RecentKind = "task" | "note";

export interface RecentItem {
  kind: RecentKind;
  id: string;
  title: string;
  spaceId: string;
  viewedAt: number;
}

const STORAGE_KEY = "taskflow.recent";
const MAX_RECENT = 5;

function read(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as RecentItem[]).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function persist(items: RecentItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / privacy-mode failures
  }
}

interface RecentState {
  items: RecentItem[];
  /** Records a viewed task/note, de-duplicating and keeping the last five. */
  record: (item: Omit<RecentItem, "viewedAt">) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>((set) => ({
  items: read(),

  record: (item) =>
    set((state) => {
      const next = [
        { ...item, viewedAt: Date.now() },
        ...state.items.filter(
          (existing) => !(existing.kind === item.kind && existing.id === item.id),
        ),
      ].slice(0, MAX_RECENT);
      persist(next);
      return { items: next };
    }),

  clear: () => {
    persist([]);
    set({ items: [] });
  },
}));
