import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { NotesService } from "@/services/notes";

describe("NotesService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list sends spaceId and null filters by default", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.list("sp1");
    expect(invokeMock).toHaveBeenCalledWith("notesList", {
      spaceId: "sp1",
      category: null,
      tag: null,
      query: null,
      status: null,
    });
  });

  it("list forwards the given filters", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.list("sp1", { category: "HR", status: "published", query: "отпуск" });
    expect(invokeMock).toHaveBeenCalledWith("notesList", {
      spaceId: "sp1",
      category: "HR",
      tag: null,
      query: "отпуск",
      status: "published",
    });
  });

  it("get sends spaceId and id", async () => {
    invokeMock.mockResolvedValue({ meta: {}, content: "" });
    await NotesService.get("sp1", "n1");
    expect(invokeMock).toHaveBeenCalledWith("notesGet", { spaceId: "sp1", id: "n1" });
  });

  it("create maps spaceId and the payload with an empty content default", async () => {
    invokeMock.mockResolvedValue({ meta: {}, content: "" });
    await NotesService.create("sp1", { title: "T", category: "C" });
    expect(invokeMock).toHaveBeenCalledWith("notesCreate", {
      spaceId: "sp1",
      title: "T",
      category: "C",
      content: "",
    });
  });

  it("update sends spaceId and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ meta: { version: 2 } });
    await NotesService.update("sp1", "n1", "New", "C", ["kb"], "body", 1);
    expect(invokeMock).toHaveBeenCalledWith("notesUpdate", {
      spaceId: "sp1",
      id: "n1",
      title: "New",
      category: "C",
      tags: ["kb"],
      content: "body",
      expectedVersion: 1,
    });
  });

  it("publish sends spaceId and expectedVersion", async () => {
    invokeMock.mockResolvedValue({ meta: { status: "published" } });
    await NotesService.publish("sp1", "n1", 1);
    expect(invokeMock).toHaveBeenCalledWith("notesPublish", {
      spaceId: "sp1",
      id: "n1",
      expectedVersion: 1,
    });
  });

  it("delete sends spaceId and id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await NotesService.delete("sp1", "n1");
    expect(invokeMock).toHaveBeenCalledWith("notesDelete", { spaceId: "sp1", id: "n1" });
  });

  it("getHistory sends spaceId and id", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.getHistory("sp1", "n1");
    expect(invokeMock).toHaveBeenCalledWith("notesGetHistory", { spaceId: "sp1", id: "n1" });
  });

  it("restoreVersion sends spaceId, id and version", async () => {
    invokeMock.mockResolvedValue({ meta: { version: 4 } });
    await NotesService.restoreVersion("sp1", "n1", 2);
    expect(invokeMock).toHaveBeenCalledWith("notesRestoreVersion", {
      spaceId: "sp1",
      id: "n1",
      version: 2,
    });
  });

  it("listCategories sends spaceId", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.listCategories("sp1");
    expect(invokeMock).toHaveBeenCalledWith("notesListCategories", { spaceId: "sp1" });
  });

  it("createCategory sends spaceId and the name", async () => {
    invokeMock.mockResolvedValue(["HR"]);
    await NotesService.createCategory("sp1", "HR");
    expect(invokeMock).toHaveBeenCalledWith("notesCreateCategory", { spaceId: "sp1", name: "HR" });
  });

  it("deleteCategory sends spaceId and the name", async () => {
    invokeMock.mockResolvedValue([]);
    await NotesService.deleteCategory("sp1", "HR");
    expect(invokeMock).toHaveBeenCalledWith("notesDeleteCategory", { spaceId: "sp1", name: "HR" });
  });

  it("share sends noteId, spaceId and targets", async () => {
    invokeMock.mockResolvedValue({ meta: {} });
    await NotesService.share("n1", "sp1", ["sp2", "sp3"]);
    expect(invokeMock).toHaveBeenCalledWith("notesShare", {
      noteId: "n1",
      spaceId: "sp1",
      targetSpaceIds: ["sp2", "sp3"],
    });
  });

  it("importFile sends spaceId and sourcePath", async () => {
    invokeMock.mockResolvedValue({ meta: {} });
    await NotesService.importFile("sp1", "C:/tmp/guide.md");
    expect(invokeMock).toHaveBeenCalledWith("notesImport", {
      spaceId: "sp1",
      sourcePath: "C:/tmp/guide.md",
    });
  });
});
