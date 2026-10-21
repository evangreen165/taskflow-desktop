import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, changeStatusMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  changeStatusMock: vi.fn(),
}));

vi.mock("@/services/tasks", () => ({
  TasksService: {
    list: listMock,
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    changeStatus: changeStatusMock,
    delete: vi.fn(),
  },
}));

import { AppError } from "@/lib/errors";
import type { Task } from "@/services/tasks";
import { useTaskStore } from "@/stores/useTaskStore";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "new",
    priority: "medium",
    assignees: [],
    authorId: "u1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    dueDate: null,
    tags: [],
    checklist: [],
    comments: [],
    attachments: [],
    version: 1,
    watchers: [],
    projectId: null,
    spaceId: null,
    spaceName: null,
    ...overrides,
  };
}

describe("useTaskStore", () => {
  beforeEach(() => {
    listMock.mockReset();
    changeStatusMock.mockReset();
    useTaskStore.setState({ tasks: [], loading: false, error: null });
  });

  it("fetchTasks loads tasks into the store", async () => {
    listMock.mockResolvedValue({ ok: true, value: [makeTask()] });
    await useTaskStore.getState().fetchTasks("sp1");
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().loading).toBe(false);
  });

  it("moveTask applies the server task on success", async () => {
    const task = makeTask();
    useTaskStore.setState({ tasks: [task] });
    changeStatusMock.mockResolvedValue({
      ok: true,
      value: { ...task, status: "in_progress", version: 2 },
    });

    const error = await useTaskStore.getState().moveTask("sp1", "t1", "in_progress", 1);

    expect(error).toBeNull();
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      status: "in_progress",
      version: 2,
    });
    expect(changeStatusMock).toHaveBeenCalledWith("sp1", "t1", "in_progress", 1);
  });

  it("moveTask rolls back and returns the error on failure", async () => {
    const task = makeTask();
    useTaskStore.setState({ tasks: [task] });
    changeStatusMock.mockResolvedValue({
      ok: false,
      error: new AppError({ code: "VERSION_CONFLICT", message: "conflict" }),
    });

    const error = await useTaskStore.getState().moveTask("sp1", "t1", "in_progress", 1);

    expect(error?.code).toBe("VERSION_CONFLICT");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      status: "new",
      version: 1,
    });
  });
});
