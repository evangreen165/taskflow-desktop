import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TasksService } from "@/services/tasks";

describe("TasksService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list sends an empty filter by default", async () => {
    invokeMock.mockResolvedValue([]);
    await TasksService.list();
    expect(invokeMock).toHaveBeenCalledWith("tasksList", { filter: {} });
  });

  it("list forwards the date range", async () => {
    invokeMock.mockResolvedValue([]);
    await TasksService.list({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(invokeMock).toHaveBeenCalledWith("tasksList", {
      filter: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });
  });

  it("get sends the id", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.get("t1");
    expect(invokeMock).toHaveBeenCalledWith("tasksGet", { id: "t1" });
  });

  it("create wraps the payload", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.create({ title: "A", status: "new" });
    expect(invokeMock).toHaveBeenCalledWith("tasksCreate", {
      payload: { title: "A", status: "new" },
    });
  });

  it("update sends patch and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.update("t1", { title: "B" }, 3);
    expect(invokeMock).toHaveBeenCalledWith("tasksUpdate", {
      id: "t1",
      patch: { title: "B" },
      expectedVersion: 3,
    });
  });

  it("changeStatus sends status and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.changeStatus("t1", "in_progress", 2);
    expect(invokeMock).toHaveBeenCalledWith("tasksChangeStatus", {
      id: "t1",
      status: "in_progress",
      expectedVersion: 2,
    });
  });

  it("delete sends the id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await TasksService.delete("t1");
    expect(invokeMock).toHaveBeenCalledWith("tasksDelete", { id: "t1" });
  });
});
