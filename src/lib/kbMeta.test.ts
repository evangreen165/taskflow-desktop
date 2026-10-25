import { describe, expect, it } from "vitest";

import {
  categoryIcon,
  EMPTY_KB_FILTER,
  filterNoteItems,
  NOTE_STATUS_LABELS,
  truncatePreview,
} from "@/lib/kbMeta";
import type { NoteListItem } from "@/services/notes";

function makeItem(overrides: Partial<NoteListItem> = {}): NoteListItem {
  return {
    id: "n1",
    title: "Онбординг сотрудника",
    category: "Онбординг",
    tags: [],
    aliases: [],
    authorId: "u1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    publishedAt: null,
    status: "draft",
    version: 1,
    linkedTaskIds: [],
    sharedWithSpaces: [],
    shared: false,
    preview: "Шаги по онбордингу нового сотрудника.",
    ...overrides,
  };
}

const items = [
  makeItem({ id: "a", category: "Онбординг", status: "published", authorId: "u1" }),
  makeItem({ id: "b", category: "Разработка", status: "draft", authorId: "u2" }),
  makeItem({
    id: "c",
    category: "Разработка",
    status: "draft",
    authorId: "u1",
    preview: "Архитектура модуля синхронизации.",
  }),
];

describe("categoryIcon", () => {
  it("maps known categories and falls back to a file icon", () => {
    expect(categoryIcon("Онбординг")).toBe("🚀");
    expect(categoryIcon("Разработка")).toBe("💻");
    expect(categoryIcon("Что-то новое")).toBe("📄");
  });
});

describe("truncatePreview", () => {
  it("truncates long previews with an ellipsis", () => {
    expect(truncatePreview("short")).toBe("short");
    expect(truncatePreview("x".repeat(150), 120).length).toBeLessThanOrEqual(121);
  });
});

describe("filterNoteItems", () => {
  it("returns everything for an empty filter", () => {
    expect(filterNoteItems(items, EMPTY_KB_FILTER, "u1")).toHaveLength(3);
  });

  it("filters by category", () => {
    const result = filterNoteItems(items, { ...EMPTY_KB_FILTER, category: "Разработка" }, "u1");
    expect(result.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filters published", () => {
    const result = filterNoteItems(items, { ...EMPTY_KB_FILTER, status: "published" }, "u1");
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("filters my drafts by current user", () => {
    const result = filterNoteItems(items, { ...EMPTY_KB_FILTER, status: "mine" }, "u1");
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });

  it("searches title and preview", () => {
    const result = filterNoteItems(items, { ...EMPTY_KB_FILTER, search: "архитектура" }, "u1");
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });
});

describe("NOTE_STATUS_LABELS", () => {
  it("has labels for every status", () => {
    expect(NOTE_STATUS_LABELS.draft).toBe("Черновик");
    expect(NOTE_STATUS_LABELS.published).toBe("Опубликована");
    expect(NOTE_STATUS_LABELS.archived).toBe("В архиве");
  });
});
