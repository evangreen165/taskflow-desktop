import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { SearchService } from "@/services/search";

describe("SearchService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("global sends only the query when no space is given", async () => {
    invokeMock.mockResolvedValue({ tasks: [], notes: [] });
    await SearchService.global("login");
    expect(invokeMock).toHaveBeenCalledWith("globalSearch", { query: "login" });
  });

  it("global forwards the optional spaceId", async () => {
    invokeMock.mockResolvedValue({ tasks: [], notes: [] });
    await SearchService.global("login", "sp1");
    expect(invokeMock).toHaveBeenCalledWith("globalSearch", {
      query: "login",
      spaceId: "sp1",
    });
  });
});
