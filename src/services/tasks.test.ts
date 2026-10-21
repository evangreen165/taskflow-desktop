import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TasksService } from "@/services/tasks";

describe("TasksService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list sends spaceId and an empty filter by default", async () => {
    invokeMock.mockResolvedValue([]);
    await TasksService.list("sp1");
    expect(invokeMock).toHaveBeenCalledWith("tasksList", { spaceId: "sp1", filter: {} });
  });

  it("list forwards the date range", async () => {
    invokeMock.mockResolvedValue([]);
    await TasksService.list("sp1", { startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(invokeMock).toHaveBeenCalledWith("tasksList", {
      spaceId: "sp1",
      filter: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });
  });

  it("get sends spaceId and id", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.get("sp1", "t1");
    expect(invokeMock).toHaveBeenCalledWith("tasksGet", { spaceId: "sp1", id: "t1" });
  });

  it("create wraps spaceId and the payload", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.create("sp1", { title: "A", status: "new" });
    expect(invokeMock).toHaveBeenCalledWith("tasksCreate", {
      spaceId: "sp1",
      payload: { title: "A", status: "new" },
    });
  });

  it("update sends spaceId, patch and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.update("sp1", "t1", { title: "B" }, 3);
    expect(invokeMock).toHaveBeenCalledWith("tasksUpdate", {
      spaceId: "sp1",
      id: "t1",
      patch: { title: "B" },
      expectedVersion: 3,
    });
  });

  it("changeStatus sends spaceId, status and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.changeStatus("sp1", "t1", "in_progress", 2);
    expect(invokeMock).toHaveBeenCalledWith("tasksChangeStatus", {
      spaceId: "sp1",
      id: "t1",
      status: "in_progress",
      expectedVersion: 2,
    });
  });

  it("delete sends spaceId and id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await TasksService.delete("sp1", "t1");
    expect(invokeMock).toHaveBeenCalledWith("tasksDelete", { spaceId: "sp1", id: "t1" });
  });

  it("move sends taskId and both spaces", async () => {
    invokeMock.mockResolvedValue({ id: "t1" });
    await TasksService.move("t1", "sp1", "sp2");
    expect(invokeMock).toHaveBeenCalledWith("tasksMove", {
      taskId: "t1",
      fromSpaceId: "sp1",
      toSpaceId: "sp2",
    });
  });
});
