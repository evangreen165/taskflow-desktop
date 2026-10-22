import { describe, expect, it } from "vitest";

import { buildNotePatch, noteToDraft, type NoteDraft } from "@/lib/noteEditor";
import type { Note } from "@/services/notes";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    meta: {
      id: "n1",
      title: "Онбординг",
      category: "Процессы",
      tags: ["kb"],
      authorId: "u1",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      publishedAt: null,
      status: "draft",
      version: 1,
      linkedTaskIds: [],
      sharedWithSpaces: [],
    },
    content: "Текст статьи.",
    historyVersions: [],
    shared: false,
    ...overrides,
  };
}

describe("noteToDraft", () => {
  it("maps a note into the editable draft", () => {
    const draft = noteToDraft(makeNote());
    expect(draft).toEqual({
      title: "Онбординг",
      category: "Процессы",
      tags: ["kb"],
      content: "Текст статьи.",
    });
  });
});

describe("buildNotePatch", () => {
  it("returns null when unchanged", () => {
    const base = noteToDraft(makeNote());
    expect(buildNotePatch(base, base)).toBeNull();
  });

  it("diffs changed fields", () => {
    const base = noteToDraft(makeNote());
    const draft: NoteDraft = { ...base, title: "Новое", tags: ["kb", "онбординг"] };
    const patch = buildNotePatch(draft, base);
    expect(patch).toEqual({
      title: "Новое",
      category: "Процессы",
      tags: ["kb", "онбординг"],
      content: "Текст статьи.",
    });
  });
});
