import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export type NoteStatus = "draft" | "published" | "archived";

export interface NoteMeta {
  id: string;
  title: string;
  category: string;
  tags: string[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  status: NoteStatus;
  version: number;
  linkedTaskIds: string[];
  sharedWithSpaces: string[];
}

/** `notesList` item: meta flattened plus a content snippet. */
export interface NoteListItem extends NoteMeta {
  preview: string;
  shared: boolean;
}

export interface Note {
  meta: NoteMeta;
  content: string;
  historyVersions: number[];
  shared: boolean;
}

export interface NoteListFilter {
  category?: string;
  tag?: string;
  query?: string;
  status?: NoteStatus;
}

export interface CreateNotePayload {
  title: string;
  category: string;
  content?: string;
}

export const NotesService = {
  list(spaceId: string, filter: NoteListFilter = {}): Promise<Result<NoteListItem[]>> {
    return invokeCommand<NoteListItem[]>("notesList", {
      spaceId,
      category: filter.category ?? null,
      tag: filter.tag ?? null,
      query: filter.query ?? null,
      status: filter.status ?? null,
    });
  },

  get(spaceId: string, id: string): Promise<Result<Note>> {
    return invokeCommand<Note>("notesGet", { spaceId, id });
  },

  create(spaceId: string, payload: CreateNotePayload): Promise<Result<Note>> {
    return invokeCommand<Note>("notesCreate", {
      spaceId,
      title: payload.title,
      category: payload.category,
      content: payload.content ?? "",
    });
  },

  update(
    spaceId: string,
    id: string,
    title: string,
    category: string,
    tags: string[],
    content: string,
    version: number,
  ): Promise<Result<Note>> {
    return invokeCommand<Note>("notesUpdate", {
      spaceId,
      id,
      title,
      category,
      tags,
      content,
      expectedVersion: version,
    });
  },

  publish(spaceId: string, id: string, version: number): Promise<Result<Note>> {
    return invokeCommand<Note>("notesPublish", { spaceId, id, expectedVersion: version });
  },

  delete(spaceId: string, id: string): Promise<Result<void>> {
    return invokeCommand<void>("notesDelete", { spaceId, id });
  },

  getHistory(spaceId: string, id: string): Promise<Result<NoteMeta[]>> {
    return invokeCommand<NoteMeta[]>("notesGetHistory", { spaceId, id });
  },

  restoreVersion(spaceId: string, id: string, version: number): Promise<Result<Note>> {
    return invokeCommand<Note>("notesRestoreVersion", { spaceId, id, version });
  },

  listCategories(spaceId: string): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesListCategories", { spaceId });
  },

  createCategory(spaceId: string, name: string): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesCreateCategory", { spaceId, name });
  },

  /** Resolves a note id from an exact (case-insensitive) title. */
  resolveTitle(spaceId: string, title: string): Promise<Result<string | null>> {
    return invokeCommand<string | null>("notesResolveTitle", { spaceId, title });
  },

  /** Notes whose content links to `[[noteTitle]]`. */
  getBacklinks(spaceId: string, noteTitle: string): Promise<Result<NoteMeta[]>> {
    return invokeCommand<NoteMeta[]>("notesGetBacklinks", { spaceId, noteTitle });
  },

  deleteCategory(spaceId: string, name: string): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesDeleteCategory", { spaceId, name });
  },

  /** Imports a local `.md`/`.pdf` file as a note. */
  importFile(spaceId: string, sourcePath: string): Promise<Result<Note>> {
    return invokeCommand<Note>("notesImport", { spaceId, sourcePath });
  },

  /** Shares a note with other spaces (read-only access). */
  share(noteId: string, spaceId: string, targetSpaceIds: string[]): Promise<Result<Note>> {
    return invokeCommand<Note>("notesShare", { noteId, spaceId, targetSpaceIds });
  },
};
