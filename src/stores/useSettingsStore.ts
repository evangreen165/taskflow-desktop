import { create } from "zustand";

const STORAGE_KEY = "taskflow.settings";

export interface SettingsState {
  hideEmptyColumns: boolean;
  setHideEmptyColumns: (value: boolean) => void;
}

function readInitial(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { hideEmptyColumns?: boolean };
      return parsed.hideEmptyColumns === true;
    }
  } catch {
    // ignore
  }
  return false;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  hideEmptyColumns: readInitial(),
  setHideEmptyColumns: (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hideEmptyColumns: value }));
    } catch {
      // ignore
    }
    set({ hideEmptyColumns: value });
  },
}));
