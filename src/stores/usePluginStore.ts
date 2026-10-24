import { create } from "zustand";

import { PluginsService } from "@/services/plugins";

interface PluginState {
  /** Whether each plugin is currently busy (e.g. an LLM request is running). */
  busy: Record<string, boolean>;
  setBusy: (pluginId: string, busy: boolean) => void;

  /** Extension-system master toggle (OFF by default). */
  extensionsEnabled: boolean;
  /** Per-plugin on/off state (absent = disabled). */
  pluginStates: Record<string, boolean>;
  /** Whether settings were loaded from the backend. */
  extensionsLoaded: boolean;
  loadExtensions: () => Promise<void>;
  setExtensionsEnabled: (value: boolean) => Promise<void>;
  setPluginState: (pluginId: string, value: boolean) => Promise<void>;
}

export const usePluginStore = create<PluginState>((set) => ({
  busy: {},
  setBusy: (pluginId, busy) => set((state) => ({ busy: { ...state.busy, [pluginId]: busy } })),

  extensionsEnabled: false,
  pluginStates: {},
  extensionsLoaded: false,

  loadExtensions: async () => {
    const result = await PluginsService.getSettings();
    if (result.ok) {
      set({
        extensionsEnabled: result.value.enabled,
        pluginStates: result.value.plugins,
        extensionsLoaded: true,
      });
    }
  },

  setExtensionsEnabled: async (value) => {
    const prev = usePluginStore.getState();
    set({ extensionsEnabled: value });
    const result = await PluginsService.setSettings({
      enabled: value,
      plugins: prev.pluginStates,
    });
    if (result.ok) {
      set({
        extensionsEnabled: result.value.enabled,
        pluginStates: result.value.plugins,
      });
    } else {
      // Roll back on failure.
      set({ extensionsEnabled: prev.extensionsEnabled });
    }
  },

  setPluginState: async (pluginId, value) => {
    const prev = usePluginStore.getState();
    const next = { ...prev.pluginStates, [pluginId]: value };
    set({ pluginStates: next });
    const result = await PluginsService.setSettings({
      enabled: prev.extensionsEnabled,
      plugins: next,
    });
    if (result.ok) {
      set({ pluginStates: result.value.plugins });
    } else {
      set({ pluginStates: prev.pluginStates });
    }
  },
}));
