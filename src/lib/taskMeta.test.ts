import { describe, expect, it } from "vitest";

import {
  avatarColorFor,
  formatDueDate,
  initials,
  isOverdue,
  KANBAN_COLUMNS,
  statusLabel,
} from "@/lib/taskMeta";

describe("KANBAN_COLUMNS", () => {
  it("lists the five statuses in board order", () => {
    expect(KANBAN_COLUMNS.map((column) => column.status)).toEqual([
      "new",
      "in_progress",
      "review",
      "done",
      "rejected",
    ]);
    expect(KANBAN_COLUMNS.map((column) => column.label)).toEqual([
      "Новая",
      "В работе",
      "На проверке",
      "Готово",
      "Отклонена",
    ]);
  });
});

describe("statusLabel", () => {
  it("maps statuses to Russian labels", () => {
    expect(statusLabel("new")).toBe("Новая");
    expect(statusLabel("in_progress")).toBe("В работе");
    expect(statusLabel("rejected")).toBe("Отклонена");
  });
});

describe("isOverdue", () => {
  const past = "2020-01-01T00:00:00Z";
  const future = "2999-01-01T00:00:00Z";

  it("is true for a past due date on a non-done task", () => {
    expect(isOverdue(past, "new")).toBe(true);
    expect(isOverdue(past, "in_progress")).toBe(true);
  });

  it("is false for done, future, missing or invalid dates", () => {
    expect(isOverdue(past, "done")).toBe(false);
    expect(isOverdue(future, "new")).toBe(false);
    expect(isOverdue(null, "new")).toBe(false);
    expect(isOverdue("not-a-date", "new")).toBe(false);
  });
});

describe("initials", () => {
  it("uses the first letters of up to two name parts", () => {
    expect(initials("Алексей Ковалёв")).toBe("АК");
    expect(initials("Иван")).toBe("И");
    expect(initials("  ")).toBe("?");
  });
});

describe("avatarColorFor", () => {
  it("is deterministic", () => {
    expect(avatarColorFor("user-1")).toBe(avatarColorFor("user-1"));
    expect(avatarColorFor("user-1").startsWith("#")).toBe(true);
  });
});

describe("formatDueDate", () => {
  it("formats valid dates and ignores invalid/null values", () => {
    expect(formatDueDate("2026-10-18T00:00:00Z")).not.toBeNull();
    expect(formatDueDate(null)).toBeNull();
    expect(formatDueDate("not-a-date")).toBeNull();
  });
});
