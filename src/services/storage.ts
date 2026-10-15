import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

/** Entry returned by `listDir`. */
export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string | null;
}

export interface ListDirFilter {
  extensions?: string[];
  includeHidden?: boolean;
}

export interface FileHash {
  sha256: string;
  size: number;
}

export interface LockStatus {
  acquired: boolean;
  isLocked: boolean;
  key: string;
  expiresAt: string | null;
  owner: string | null;
  token: string | null;
}

export type FsEventKind = "created" | "modified" | "removed" | "changed";

export interface FsEvent {
  kind: FsEventKind;
  path: string;
  timestamp: string;
}

export interface FsBatchEvent {
  events: FsEvent[];
}

/** Tauri event name emitted by the workspace watcher. */
export const FS_EVENT_NAME = "workspace://fs-event";

/**
 * Typed facade over the Rust storage commands. All paths are relative to the
 * workspace root; every method resolves to `Result<T, AppError>`.
 */
export const StorageService = {
  readJson<T>(path: string): Promise<Result<T>> {
    return invokeCommand<T>("readJson", { path });
  },

  writeJsonAtomic<T>(path: string, value: T): Promise<Result<void>> {
    return invokeCommand<void>("writeJsonAtomic", { path, value });
  },

  readText(path: string): Promise<Result<string>> {
    return invokeCommand<string>("readText", { path });
  },

  writeTextAtomic(path: string, content: string): Promise<Result<void>> {
    return invokeCommand<void>("writeTextAtomic", { path, content });
  },

  createExclusive(path: string): Promise<Result<void>> {
    return invokeCommand<void>("createExclusive", { path });
  },

  removePath(path: string): Promise<Result<void>> {
    return invokeCommand<void>("removePath", { path });
  },

  exists(path: string): Promise<Result<boolean>> {
    return invokeCommand<boolean>("exists", { path });
  },

  listDir(path: string, filter?: ListDirFilter): Promise<Result<DirEntry[]>> {
    return invokeCommand<DirEntry[]>("listDir", { path, filter: filter ?? null });
  },

  hashFile(path: string): Promise<Result<FileHash>> {
    return invokeCommand<FileHash>("hashFile", { path });
  },

  /** Acquires a TTL lock. `key` is `{entity}-{id}`, e.g. `task-T-42`. */
  acquireLock(key: string, ttlSec: number): Promise<Result<LockStatus>> {
    return invokeCommand<LockStatus>("acquireLock", { key, ttlSec });
  },

  releaseLock(key: string, token: string): Promise<Result<void>> {
    return invokeCommand<void>("releaseLock", { key, token });
  },

  isLocked(key: string): Promise<Result<LockStatus>> {
    return invokeCommand<LockStatus>("isLocked", { key });
  },

  /** Starts the Rust workspace watcher (idempotent). */
  startWatcher(path?: string): Promise<Result<void>> {
    return invokeCommand<void>("watch", { path: path ?? null });
  },

  /** Subscribes to debounced filesystem change batches. */
  watch(onBatch: (batch: FsBatchEvent) => void): Promise<UnlistenFn> {
    return listen<FsBatchEvent>(FS_EVENT_NAME, (event) => {
      onBatch(event.payload);
    });
  },
};
