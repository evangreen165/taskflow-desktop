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
}

/** `notesList` item: meta flattened plus a content snippet. */
export interface NoteListItem extends NoteMeta {
  preview: string;
}

export interface Note {
  meta: NoteMeta;
  content: string;
  historyVersions: number[];
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
  list(filter: NoteListFilter = {}): Promise<Result<NoteListItem[]>> {
    return invokeCommand<NoteListItem[]>("notesList", {
      category: filter.category ?? null,
      tag: filter.tag ?? null,
      query: filter.query ?? null,
      status: filter.status ?? null,
    });
  },

  get(id: string): Promise<Result<Note>> {
    return invokeCommand<Note>("notesGet", { id });
  },

  create(payload: CreateNotePayload): Promise<Result<Note>> {
    return invokeCommand<Note>("notesCreate", {
      title: payload.title,
      category: payload.category,
      content: payload.content ?? "",
    });
  },

  update(
    id: string,
    title: string,
    category: string,
    tags: string[],
    content: string,
    version: number,
  ): Promise<Result<Note>> {
    return invokeCommand<Note>("notesUpdate", {
      id,
      title,
      category,
      tags,
      content,
      expectedVersion: version,
    });
  },

  publish(id: string, version: number): Promise<Result<Note>> {
    return invokeCommand<Note>("notesPublish", { id, expectedVersion: version });
  },

  delete(id: string): Promise<Result<void>> {
    return invokeCommand<void>("notesDelete", { id });
  },

  getHistory(id: string): Promise<Result<NoteMeta[]>> {
    return invokeCommand<NoteMeta[]>("notesGetHistory", { id });
  },

  restoreVersion(id: string, version: number): Promise<Result<Note>> {
    return invokeCommand<Note>("notesRestoreVersion", { id, version });
  },

  listCategories(): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesListCategories");
  },

  createCategory(name: string): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesCreateCategory", { name });
  },

  deleteCategory(name: string): Promise<Result<string[]>> {
    return invokeCommand<string[]>("notesDeleteCategory", { name });
  },
};
