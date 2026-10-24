import { invoke } from "@tauri-apps/api/core";

import { AppError, err, ok, type Result } from "@/lib/errors";
import { reportAppError } from "@/lib/reportError";

/**
 * Thin typed wrapper over Tauri's `invoke` that never throws: any rejection is
 * normalized into the unified `Result<T, AppError>` contract and routed through
 * the global error handler (auth redirects / toasts).
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Result<T>> {
  try {
    const value = await invoke<T>(command, args);
    return ok(value);
  } catch (cause) {
    const error = AppError.from(cause);
    reportAppError(error);
    return err(error);
  }
}

/**
 * Same as `invokeCommand` but WITHOUT the global error handler. Used by
 * boot-time auth probes (`authRefreshSession` / `authAutoLogin`): the handler
 * navigates to `/login` on `AUTH_REQUIRED`, which would race the "remember me"
 * auto-login and strand the user on the login screen despite a valid token.
 */
export async function invokeQuiet<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Result<T>> {
  try {
    const value = await invoke<T>(command, args);
    return ok(value);
  } catch (cause) {
    return err(AppError.from(cause));
  }
}
