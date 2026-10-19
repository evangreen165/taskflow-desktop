import type { Note } from "@/services/notes";

/** Editable projection of a note used by the article editor. */
export interface NoteDraft {
  title: string;
  category: string;
  tags: string[];
  content: string;
}

export function noteToDraft(note: Note): NoteDraft {
  return {
    title: note.meta.title,
    category: note.meta.category,
    tags: [...note.meta.tags],
    content: note.content,
  };
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export interface NotePatch {
  title: string;
  category: string;
  tags: string[];
  content: string;
}

/** Diff against the last server-confirmed draft; null when unchanged. */
export function buildNotePatch(draft: NoteDraft, base: NoteDraft): NotePatch | null {
  if (
    draft.title === base.title &&
    draft.category === base.category &&
    sameStrings(draft.tags, base.tags) &&
    draft.content === base.content
  ) {
    return null;
  }
  return {
    title: draft.title,
    category: draft.category,
    tags: draft.tags,
    content: draft.content,
  };
}

export function hasNoteChanges(draft: NoteDraft, base: NoteDraft): boolean {
  return buildNotePatch(draft, base) !== null;
}
