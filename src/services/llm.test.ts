import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { LlmService } from "@/services/llm";

describe("LlmService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("proxy forwards url, apiKey and body", async () => {
    invokeMock.mockResolvedValue('{"choices":[]}');
    await LlmService.proxy("https://openrouter.ai/v1/chat/completions", "sk-1", '{"model":"x"}');
    expect(invokeMock).toHaveBeenCalledWith("llmProxyRequest", {
      url: "https://openrouter.ai/v1/chat/completions",
      apiKey: "sk-1",
      body: '{"model":"x"}',
    });
  });
});
