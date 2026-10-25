import { useTabStore } from "@/stores/useTabStore";

/**
 * Programmatic navigation hook for code outside the React tree (stores, the
 * global error handler). Registered once in `main.tsx` with the router.
 */

export interface AppNavigateOptions {
  state?: unknown;
  replace?: boolean;
  /** Tab title override (e.g. a plugin's display name). */
  title?: string;
}

let navigateFn: ((path: string, options?: AppNavigateOptions) => void) | null = null;

export function setAppNavigator(fn: (path: string, options?: AppNavigateOptions) => void): void {
  navigateFn = fn;
}

/** Human-readable tab title for an app path. */
export function tabTitleForPath(pathname: string): string {
  if (pathname.startsWith("/app/dashboard")) return "Главная";
  if (pathname.startsWith("/app/tasks")) return "Задачи";
  if (pathname.startsWith("/app/calendar")) return "Календарь";
  if (pathname.startsWith("/app/kb/")) return "Заметка";
  if (pathname.startsWith("/app/kb")) return "Заметки";
  if (pathname.startsWith("/app/plugins/")) return "Расширение";
  if (pathname.startsWith("/app/plugins")) return "Расширения";
  if (pathname.startsWith("/app/admin")) return "Администрирование";
  if (pathname.startsWith("/app/profile")) return "Профиль";
  if (pathname.startsWith("/app/settings")) return "Настройки";
  return "TaskFlow";
}

/**
 * Navigates and updates the tab system. The tab store — not the router — owns
 * the main area content:
 * - note paths obey `openNotesInNewTab` (new tab vs. replace the active one);
 * - task deep links obey `openTasksInNewTab`;
 * - every other page reuses an existing tab or opens one.
 */
export function appNavigate(path: string, options?: AppNavigateOptions): void {
  navigateFn?.(path, options);
  if (!path.startsWith("/app")) {
    return;
  }
  const state = useTabStore.getState();
  const title = options?.title ?? tabTitleForPath(path);
  if (path.startsWith("/app/kb/")) {
    if (state.openNotesInNewTab) {
      state.openTab(title, path);
    } else {
      state.replaceActiveTab(title, path);
    }
    return;
  }
  if (path.startsWith("/app/tasks") && path.includes("task=")) {
    if (state.openTasksInNewTab) {
      state.openTab(title, path);
    } else {
      state.openTab(title, "/app/tasks");
    }
    return;
  }
  state.openTab(title, path);
}
