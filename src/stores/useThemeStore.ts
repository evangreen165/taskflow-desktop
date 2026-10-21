import { create } from "zustand";

export type AppTheme = "light" | "dark" | "system";

const STORAGE_KEY = "taskflow.theme";

function readInitial(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // No localStorage (tests / privacy mode).
  }
  return "system";
}

/** Applies the theme by setting `data-theme` on <html>; "system" removes it. */
export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = theme;
  }
}

interface ThemeState {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readInitial(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    applyTheme(theme);
    set({ theme });
  },
}));
