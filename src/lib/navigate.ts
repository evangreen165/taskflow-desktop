/**
 * Programmatic navigation hook for code outside the React tree (stores, the
 * global error handler). Registered once in `main.tsx` with the router.
 */

export interface AppNavigateOptions {
  state?: unknown;
  replace?: boolean;
}

let navigateFn: ((path: string, options?: AppNavigateOptions) => void) | null = null;

export function setAppNavigator(fn: (path: string, options?: AppNavigateOptions) => void): void {
  navigateFn = fn;
}

export function appNavigate(path: string, options?: AppNavigateOptions): void {
  navigateFn?.(path, options);
}
