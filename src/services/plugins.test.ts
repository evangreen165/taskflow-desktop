import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PluginsService } from "@/services/plugins";

describe("PluginsService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list has no args", async () => {
    invokeMock.mockResolvedValue([]);
    await PluginsService.list();
    expect(invokeMock).toHaveBeenCalledWith("pluginsList", undefined);
  });

  it("getContent sends the plugin id", async () => {
    invokeMock.mockResolvedValue("<h1>Hi</h1>");
    await PluginsService.getContent("notes-graph");
    expect(invokeMock).toHaveBeenCalledWith("pluginGetContent", {
      pluginId: "notes-graph",
    });
  });
});
