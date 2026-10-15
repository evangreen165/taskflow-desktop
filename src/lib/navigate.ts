/**
 * Programmatic navigation hook for code outside the React tree (the global
 * error handler). Registered once in `main.tsx` with the router instance.
 */

let navigateFn: ((path: string) => void) | null = null;

export function setAppNavigator(fn: (path: string) => void): void {
  navigateFn = fn;
}

export function appNavigate(path: string): void {
  navigateFn?.(path);
}
