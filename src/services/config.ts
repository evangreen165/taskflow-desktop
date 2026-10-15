import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Per-machine app configuration (Tauri store).
 *
 * Only machine-local data lives here — notably the path to the shared
 * workspace folder. Nothing in this store is shared between machines.
 */

const STORE_FILE = "app-config.json";
const WORKSPACE_PATH_KEY = "workspacePath";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { autoSave: false });
  return storePromise;
}

export const ConfigService = {
  async getWorkspacePath(): Promise<string | null> {
    const store = await getStore();
    const value = await store.get<string>(WORKSPACE_PATH_KEY);
    return value ?? null;
  },

  async setWorkspacePath(path: string): Promise<void> {
    const store = await getStore();
    await store.set(WORKSPACE_PATH_KEY, path);
    await store.save();
  },

  async clear(): Promise<void> {
    const store = await getStore();
    await store.delete(WORKSPACE_PATH_KEY);
    await store.save();
  },
};
