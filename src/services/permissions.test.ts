import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PermissionsService } from "@/services/permissions";

describe("PermissionsService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list calls permissionsList", async () => {
    invokeMock.mockResolvedValue(["task.view"]);
    await PermissionsService.list();
    expect(invokeMock).toHaveBeenCalledWith("permissionsList", undefined);
  });
});
