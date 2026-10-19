import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { NotesService } from "@/services/notes";

describe("NotesService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list passes null filters by default", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.list();
    expect(invokeMock).toHaveBeenCalledWith("notesList", {
      category: null,
      tag: null,
      query: null,
      status: null,
    });
  });

  it("list forwards the given filters", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.list({ category: "HR", status: "published", query: "отпуск" });
    expect(invokeMock).toHaveBeenCalledWith("notesList", {
      category: "HR",
      tag: null,
      query: "отпуск",
      status: "published",
    });
  });

  it("get sends the id", async () => {
    invokeMock.mockResolvedValue({ meta: {}, content: "" });
    await NotesService.get("n1");
    expect(invokeMock).toHaveBeenCalledWith("notesGet", { id: "n1" });
  });

  it("create maps the payload with an empty content default", async () => {
    invokeMock.mockResolvedValue({ meta: {}, content: "" });
    await NotesService.create({ title: "T", category: "C" });
    expect(invokeMock).toHaveBeenCalledWith("notesCreate", {
      title: "T",
      category: "C",
      content: "",
    });
  });

  it("update sends expectedVersion", async () => {
    invokeMock.mockResolvedValue({ meta: { version: 2 } });
    await NotesService.update("n1", "New", "C", ["kb"], "body", 1);
    expect(invokeMock).toHaveBeenCalledWith("notesUpdate", {
      id: "n1",
      title: "New",
      category: "C",
      tags: ["kb"],
      content: "body",
      expectedVersion: 1,
    });
  });

  it("publish sends expectedVersion", async () => {
    invokeMock.mockResolvedValue({ meta: { status: "published" } });
    await NotesService.publish("n1", 1);
    expect(invokeMock).toHaveBeenCalledWith("notesPublish", { id: "n1", expectedVersion: 1 });
  });

  it("delete sends the id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await NotesService.delete("n1");
    expect(invokeMock).toHaveBeenCalledWith("notesDelete", { id: "n1" });
  });

  it("getHistory sends the id", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.getHistory("n1");
    expect(invokeMock).toHaveBeenCalledWith("notesGetHistory", { id: "n1" });
  });

  it("restoreVersion sends id and version", async () => {
    invokeMock.mockResolvedValue({ meta: { version: 4 } });
    await NotesService.restoreVersion("n1", 2);
    expect(invokeMock).toHaveBeenCalledWith("notesRestoreVersion", { id: "n1", version: 2 });
  });
});
