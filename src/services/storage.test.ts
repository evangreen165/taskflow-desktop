import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { StorageService } from "@/services/storage";

describe("StorageService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("maps a successful command into ok(value)", async () => {
    invokeMock.mockResolvedValue({ name: "TaskFlow" });
    const result = await StorageService.readJson<{ name: string }>("config.json");
    expect(invokeMock).toHaveBeenCalledWith("readJson", { path: "config.json" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: "TaskFlow" });
    }
  });

  it("maps a rejected command into the unified AppError", async () => {
    invokeMock.mockRejectedValue({ code: "NOT_FOUND", message: "no file" });
    const result = await StorageService.readText("tasks/T-1.json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("no file");
    }
  });

  it("sends camelCase arguments for writeJsonAtomic", async () => {
    invokeMock.mockResolvedValue(undefined);
    await StorageService.writeJsonAtomic("tasks/T-1.json", { id: "T-1" });
    expect(invokeMock).toHaveBeenCalledWith("writeJsonAtomic", {
      path: "tasks/T-1.json",
      value: { id: "T-1" },
    });
  });

  it("sends key and ttlSec for lock operations", async () => {
    invokeMock.mockResolvedValue({ acquired: true });
    await StorageService.acquireLock("task-T-1", 120);
    expect(invokeMock).toHaveBeenCalledWith("acquireLock", { key: "task-T-1", ttlSec: 120 });

    invokeMock.mockResolvedValue(undefined);
    await StorageService.releaseLock("task-T-1", "token");
    expect(invokeMock).toHaveBeenCalledWith("releaseLock", { key: "task-T-1", token: "token" });
  });

  it("defaults the listDir filter to null", async () => {
    invokeMock.mockResolvedValue([]);
    await StorageService.listDir("tasks");
    expect(invokeMock).toHaveBeenCalledWith("listDir", { path: "tasks", filter: null });
  });
});
