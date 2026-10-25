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
 * Navigates within the app. For `/app/*` paths the tab store is the only
 * source of truth: the URL is updated with `history.replaceState` (so F5
 * works) but NO router navigation / history entry is created, and a synthetic
 * `popstate` lets the top-level router notice a login → workspace transition.
 * Non-app paths (`/login`, `/onboarding`) still use the router.
 */
export function appNavigate(path: string, options?: AppNavigateOptions): void {
  if (!path.startsWith("/app")) {
    navigateFn?.(path, options);
    return;
  }

  const url = `${window.location.pathname}${window.location.search}#${path}`;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));

  const state = useTabStore.getState();
  const title = options?.title ?? tabTitleForPath(path);

  if (path.startsWith("/app/tasks") && path.includes("task=")) {
    state.openTab(title, state.openTasksInNewTab ? path : "/app/tasks");
    return;
  }

  const replace =
    options?.replace === true || (path.startsWith("/app/kb/") && !state.openNotesInNewTab);
  if (replace) {
    state.replaceActiveTab(title, path);
  } else {
    state.openTab(title, path);
  }
}
