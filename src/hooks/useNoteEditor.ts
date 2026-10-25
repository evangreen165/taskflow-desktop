import { useRef, useState } from "react";

import type { AppError } from "@/lib/errors";
import { buildNotePatch, noteToDraft, type NoteDraft } from "@/lib/noteEditor";
import { NotesService, type Note } from "@/services/notes";

const DEBOUNCE_MS = 800;

export interface UseNoteEditorResult {
  draft: NoteDraft;
  saving: boolean;
  error: string | null;
  conflict: boolean;
  setTitle: (value: string) => void;
  setCategory: (value: string) => void;
  setTags: (value: string[]) => void;
  setAliases: (value: string[]) => void;
  setContent: (value: string) => void;
  flush: () => Promise<void>;
  saveNow: () => Promise<void>;
  /** Resets the draft to a (freshly fetched) note, clearing any conflict. */
  reload: (note: Note) => void;
  dismissConflict: () => void;
}

/**
 * Owns the article edit draft and persists changes through `notesUpdate` with
 * optimistic versioning. Debounces all fields (800 ms); `saveNow`/`flush`
 * force a save. `VERSION_CONFLICT` stops autosave and raises `conflict`;
 * other errors revert the draft to the last server-confirmed state.
 */
export function useNoteEditor(
  initial: Note,
  spaceId: string,
  onSaved: (note: Note) => void,
): UseNoteEditorResult {
  const initialDraft = useRef<NoteDraft>(noteToDraft(initial));
  const [draft, setDraft] = useState<NoteDraft>(initialDraft.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const draftRef = useRef<NoteDraft>(initialDraft.current);
  const baseRef = useRef<NoteDraft>(initialDraft.current);
  const versionRef = useRef<number>(initial.meta.version);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);

  function clearTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleSave(): void {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, DEBOUNCE_MS);
  }

  function applyDraft(next: NoteDraft): void {
    draftRef.current = next;
    setDraft(next);
    if (conflictRef.current) {
      return;
    }
    scheduleSave();
  }

  function handleError(appError: AppError): void {
    if (appError.code === "VERSION_CONFLICT") {
      conflictRef.current = true;
      setConflict(true);
      return;
    }
    const reverted = { ...baseRef.current };
    draftRef.current = reverted;
    setDraft(reverted);
    setError(appError.message);
  }

  async function doSave(): Promise<void> {
    const patch = buildNotePatch(draftRef.current, baseRef.current);
    if (patch === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await NotesService.update(
        spaceId,
        initial.meta.id,
        patch.title,
        patch.category,
        patch.tags,
        patch.aliases,
        patch.content,
        versionRef.current,
      );
      if (!result.ok) {
        handleError(result.error);
        return;
      }
      versionRef.current = result.value.meta.version;
      baseRef.current = noteToDraft(result.value);
      onSaved(result.value);
    } finally {
      setSaving(false);
    }
  }

  async function performSave(): Promise<void> {
    if (conflictRef.current) {
      return;
    }
    if (inflightRef.current !== null) {
      pendingRef.current = true;
      await inflightRef.current;
      return;
    }
    const run = doSave();
    inflightRef.current = run;
    try {
      await run;
    } finally {
      inflightRef.current = null;
    }
    if (pendingRef.current && !conflictRef.current) {
      pendingRef.current = false;
      await performSave();
    }
  }

  function flush(): Promise<void> {
    clearTimer();
    return performSave();
  }

  function saveNow(): Promise<void> {
    return flush();
  }

  function reload(note: Note): void {
    const next = noteToDraft(note);
    draftRef.current = next;
    baseRef.current = next;
    versionRef.current = note.meta.version;
    conflictRef.current = false;
    setDraft(next);
    setConflict(false);
    setError(null);
    onSaved(note);
  }

  function dismissConflict(): void {
    setConflict(false);
  }

  function setTitle(value: string): void {
    applyDraft({ ...draftRef.current, title: value });
  }

  function setCategory(value: string): void {
    applyDraft({ ...draftRef.current, category: value });
  }

  function setTags(value: string[]): void {
    applyDraft({ ...draftRef.current, tags: value });
  }

  function setAliases(value: string[]): void {
    applyDraft({ ...draftRef.current, aliases: value });
  }

  function setContent(value: string): void {
    applyDraft({ ...draftRef.current, content: value });
  }

  return {
    draft,
    saving,
    error,
    conflict,
    setTitle,
    setCategory,
    setTags,
    setAliases,
    setContent,
    flush,
    saveNow,
    reload,
    dismissConflict,
  };
}
