import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export const LlmService = {
  /** Proxies an LLM API call from a plugin (bypasses browser CORS). */
  proxy(url: string, apiKey: string, body: string): Promise<Result<string>> {
    return invokeCommand<string>("llmProxyRequest", { url, apiKey, body });
  },
};
