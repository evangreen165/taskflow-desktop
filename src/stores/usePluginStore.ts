import { create } from "zustand";

interface PluginState {
  /** Whether each plugin is currently busy (e.g. an LLM request is running). */
  busy: Record<string, boolean>;
  setBusy: (pluginId: string, busy: boolean) => void;
}

export const usePluginStore = create<PluginState>((set) => ({
  busy: {},
  setBusy: (pluginId, busy) => set((state) => ({ busy: { ...state.busy, [pluginId]: busy } })),
}));
