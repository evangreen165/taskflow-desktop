import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions: string[];
}

export const PluginsService = {
  list(): Promise<Result<PluginManifest[]>> {
    return invokeCommand<PluginManifest[]>("pluginsList");
  },

  /** Reads the plugin's entry HTML for a sandboxed iframe. */
  getContent(pluginId: string): Promise<Result<string>> {
    return invokeCommand<string>("pluginGetContent", { pluginId });
  },
};
