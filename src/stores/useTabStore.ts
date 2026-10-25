import { create } from "zustand";

export interface Tab {
  id: string;
  title: string;
  path: string;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  /**
   * Opens a tab for `path`. If `reuse` is true the active tab's path/title are
   * replaced instead of adding a new tab.
   */
  openTab: (title: string, path: string, reuse?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `tab-${sequence}`;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: "",

  openTab: (title, path, reuse = false) => {
    const state = get();
    if (reuse && state.activeTabId) {
      set({
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId ? { ...tab, title, path } : tab,
        ),
      });
      return;
    }
    const existing = state.tabs.find((tab) => tab.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tab: Tab = { id: nextId(), title, path };
    set({ tabs: [...state.tabs, tab], activeTabId: tab.id });
  },

  closeTab: (id) => {
    const state = get();
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) {
      return;
    }
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    let activeTabId = state.activeTabId;
    if (state.activeTabId === id) {
      const next = tabs[Math.min(index, tabs.length - 1)];
      activeTabId = next ? next.id : "";
    }
    set({ tabs, activeTabId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),
}));
