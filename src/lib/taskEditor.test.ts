import { describe, expect, it } from "vitest";

import {
  buildUpdatePatch,
  fromDateInput,
  hasChanges,
  statusChanged,
  taskToDraft,
  toDateInput,
  type TaskDraft,
} from "@/lib/taskEditor";
import type { Task } from "@/services/tasks";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "Desc",
    status: "new",
    priority: "medium",
    assignees: ["u1"],
    authorId: "u1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    dueDate: "2026-10-18T00:00:00Z",
    tags: [],
    checklist: [{ id: "c1", text: "First", done: false }],
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

describe("date helpers", () => {
  it("converts ISO to date input and back", () => {
    expect(toDateInput("2026-10-18T12:00:00Z")).toBe("2026-10-18");
    expect(toDateInput(null)).toBe("");
    expect(fromDateInput("2026-10-18")).toBe("2026-10-18");
    expect(fromDateInput("   ")).toBeNull();
  });
});

describe("buildUpdatePatch", () => {
  it("omits unchanged fields", () => {
    const task = makeTask();
    const draft = taskToDraft(task);
    expect(buildUpdatePatch(draft, draft)).toEqual({});
  });

  it("includes changed editable fields", () => {
    const task = makeTask();
    const base = taskToDraft(task);
    const draft: TaskDraft = { ...base, title: "New", priority: "high", dueDate: null };
    const patch = buildUpdatePatch(draft, base);
    expect(patch.title).toBe("New");
    expect(patch.priority).toBe("high");
    expect(patch.dueDate).toBeNull();
    expect(patch.assignees).toBeUndefined();
  });

  it("includes checklist and comments diffs", () => {
    const task = makeTask({ comments: [] });
    const base = taskToDraft(task);
    const draft: TaskDraft = {
      ...base,
      checklist: [{ id: "c1", text: "First", done: true }],
      comments: [
        {
          id: "m1",
          authorId: "u1",
          text: "Note",
          createdAt: "2026-10-19T00:00:00Z",
        },
      ],
    };
    const patch = buildUpdatePatch(draft, base);
    expect(patch.checklist).toEqual([{ id: "c1", text: "First", done: true }]);
    expect(patch.comments).toHaveLength(1);
  });
});

describe("statusChanged / hasChanges", () => {
  it("detects status and field changes", () => {
    const task = makeTask();
    const base = taskToDraft(task);
    expect(statusChanged({ ...base, status: "review" }, base)).toBe(true);
    expect(statusChanged(base, base)).toBe(false);
    expect(hasChanges({ ...base, title: "X" }, base)).toBe(true);
    expect(hasChanges(base, base)).toBe(false);
  });
});
