import { describe, expect, it } from "vitest";

import { EMPTY_TASK_FILTER, filterTasks, isFilterActive } from "@/lib/filterTasks";
import type { Task } from "@/services/tasks";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Payroll integration",
    description: "Sync payroll data",
    status: "new",
    priority: "medium",
    assignees: ["u1"],
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
    ...overrides,
  };
}

const tasks = [
  makeTask({ id: "a", title: "Payroll", priority: "high", assignees: ["u1"] }),
  makeTask({
    id: "b",
    title: "Onboarding guide",
    description: "Write docs",
    priority: "low",
    assignees: ["u2"],
  }),
  makeTask({
    id: "c",
    title: "Sync bug",
    description: "Fix the sync bug",
    priority: "critical",
    assignees: ["u1", "u2"],
  }),
];

describe("filterTasks", () => {
  it("returns everything for an empty filter", () => {
    expect(filterTasks(tasks, EMPTY_TASK_FILTER)).toHaveLength(3);
  });

  it("filters by priority", () => {
    const result = filterTasks(tasks, { ...EMPTY_TASK_FILTER, priority: "high" });
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });

  it("filters by assignee", () => {
    const result = filterTasks(tasks, { ...EMPTY_TASK_FILTER, assigneeId: "u2" });
    expect(result.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("searches title and description case-insensitively", () => {
    expect(
      filterTasks(tasks, { ...EMPTY_TASK_FILTER, search: "PAYROLL" }).map((t) => t.id),
    ).toEqual(["a"]);
    expect(filterTasks(tasks, { ...EMPTY_TASK_FILTER, search: "docs" }).map((t) => t.id)).toEqual([
      "b",
    ]);
    expect(filterTasks(tasks, { ...EMPTY_TASK_FILTER, search: "zzz" })).toHaveLength(0);
  });

  it("combines multiple filters", () => {
    const result = filterTasks(tasks, { search: "s", priority: "critical", assigneeId: "u1" });
    expect(result.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("isFilterActive", () => {
  it("is false only for an empty filter", () => {
    expect(isFilterActive(EMPTY_TASK_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_TASK_FILTER, search: "  " })).toBe(false);
    expect(isFilterActive({ ...EMPTY_TASK_FILTER, priority: "low" })).toBe(true);
    expect(isFilterActive({ ...EMPTY_TASK_FILTER, assigneeId: "u1" })).toBe(true);
  });
});
