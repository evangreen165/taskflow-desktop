import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export const SystemService = {
  /**
   * Opens a URL (http/https) in the default browser or a local file/folder
   * path (including `file://`) in the OS file explorer.
   */
  openExternal(target: string): Promise<Result<void>> {
    return invokeCommand<void>("openExternal", { target });
  },
};
