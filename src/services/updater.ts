import { check, type Update } from "@tauri-apps/plugin-updater";

import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface OfflineUpdate {
  version: string;
  notes: string | null;
  path: string | null;
}

export const UpdaterService = {
  /** Online update from the configured endpoint, or null. Throws on errors. */
  checkOnline(): Promise<Update | null> {
    return check();
  },

  /** Manual drop-in update described by `updates/update.json`. */
  checkOffline(): Promise<Result<OfflineUpdate | null>> {
    return invokeCommand<OfflineUpdate | null>("checkOfflineUpdate");
  },
};
