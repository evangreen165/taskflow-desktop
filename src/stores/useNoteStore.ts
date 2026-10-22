import { create } from "zustand";

import { NotesService, type NoteListItem } from "@/services/notes";

interface NoteState {
  notes: NoteListItem[];
  categories: string[];
  loading: boolean;
  error: string | null;
  fetchNotes: (spaceId: string) => Promise<void>;
  fetchCategories: (spaceId: string) => Promise<void>;
  /** Creates a category and updates the list; false when the backend failed. */
  addCategory: (spaceId: string, name: string) => Promise<boolean>;
  removeCategory: (spaceId: string, name: string) => Promise<boolean>;
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  categories: [],
  loading: false,
  error: null,

  fetchNotes: async (spaceId) => {
    set({ loading: true, error: null });
    const result = await NotesService.list(spaceId, {});
    if (result.ok) {
      set({ notes: result.value, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchCategories: async (spaceId) => {
    const result = await NotesService.listCategories(spaceId);
    if (result.ok) {
      set({ categories: result.value });
    } else {
      set({ categories: [] });
    }
  },

  addCategory: async (spaceId, name) => {
    const result = await NotesService.createCategory(spaceId, name);
    if (result.ok) {
      set({ categories: result.value });
      return true;
    }
    return false;
  },

  removeCategory: async (spaceId, name) => {
    const result = await NotesService.deleteCategory(spaceId, name);
    if (result.ok) {
      set({ categories: result.value });
      return true;
    }
    return false;
  },
}));
