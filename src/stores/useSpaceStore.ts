import { create } from "zustand";

import { SpacesService, type Space } from "@/services/spaces";

const STORAGE_KEY = "taskflow.currentSpace";

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

interface SpaceState {
  spaces: Space[];
  currentSpaceId: string | null;
  loading: boolean;
  /** Loads accessible spaces and restores/chooses the current one. */
  fetchSpaces: () => Promise<void>;
  setCurrentSpace: (id: string) => void;
}

export const useSpaceStore = create<SpaceState>((set) => ({
  spaces: [],
  currentSpaceId: null,
  loading: false,

  fetchSpaces: async () => {
    set({ loading: true });
    const result = await SpacesService.list();
    if (!result.ok) {
      set({ loading: false });
      return;
    }
    const spaces = result.value;
    const saved = readSaved();
    const current = spaces.find((space) => space.id === saved)?.id ?? spaces[0]?.id ?? null;
    set({ spaces, currentSpaceId: current, loading: false });
    if (current) {
      persist(current);
    }
  },

  setCurrentSpace: (id) => {
    persist(id);
    set({ currentSpaceId: id });
  },
}));

export function isPersonalSpace(spaceId: string | null): boolean {
  return spaceId !== null && spaceId.startsWith("personal_");
}
