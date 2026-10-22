import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, checkMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  checkMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));

import { UpdaterService } from "@/services/updater";

describe("UpdaterService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
  });

  it("checkOffline invokes checkOfflineUpdate", async () => {
    invokeMock.mockResolvedValue(null);
    await UpdaterService.checkOffline();
    expect(invokeMock).toHaveBeenCalledWith("checkOfflineUpdate", undefined);
  });

  it("checkOnline delegates to the updater plugin", async () => {
    const update = { version: "0.7.0" };
    checkMock.mockResolvedValue(update);
    await expect(UpdaterService.checkOnline()).resolves.toBe(update);
    expect(checkMock).toHaveBeenCalled();
  });

  it("installOffline sends the installer path", async () => {
    invokeMock.mockResolvedValue(undefined);
    await UpdaterService.installOffline("updates/setup.exe");
    expect(invokeMock).toHaveBeenCalledWith("installOfflineUpdate", {
      path: "updates/setup.exe",
    });
  });
});
