import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions: string[];
  /** Injection point for the plugin UI: "sidebar" | "topbar" | "floating". */
  ui: { inject: string } | null;
}

/** Workspace-wide extension-system settings (from `config.json`). */
export interface PluginSettings {
  /** Master switch: when false, plugin UI is hidden everywhere. */
  enabled: boolean;
  /** Per-plugin on/off state (absent = disabled). */
  plugins: Record<string, boolean>;
}

export const PluginsService = {
  list(): Promise<Result<PluginManifest[]>> {
    return invokeCommand<PluginManifest[]>("pluginsList");
  },

  /** Reads the plugin's entry HTML for a sandboxed iframe. */
  getContent(pluginId: string): Promise<Result<string>> {
    return invokeCommand<string>("pluginGetContent", { pluginId });
  },

  getSettings(): Promise<Result<PluginSettings>> {
    return invokeCommand<PluginSettings>("pluginsGetSettings");
  },

  setSettings(settings: PluginSettings): Promise<Result<PluginSettings>> {
    return invokeCommand<PluginSettings>("pluginsSetSettings", { settings });
  },
};
