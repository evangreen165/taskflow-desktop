import { create } from "zustand";

import { NotesService, type NoteListItem } from "@/services/notes";

interface NoteState {
  notes: NoteListItem[];
  loading: boolean;
  error: string | null;
  fetchNotes: () => Promise<void>;
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  loading: false,
  error: null,

  fetchNotes: async () => {
    set({ loading: true, error: null });
    const result = await NotesService.list({});
    if (result.ok) {
      set({ notes: result.value, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },
}));
