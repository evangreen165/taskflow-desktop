import { invoke } from "@tauri-apps/api/core";

import { AppError, err, ok, type Result } from "@/lib/errors";

/**
 * Thin typed wrapper over Tauri's `invoke` that never throws: any rejection is
 * normalized into the unified `Result<T, AppError>` contract.
 */
export async function invokeCommand<T>(
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
