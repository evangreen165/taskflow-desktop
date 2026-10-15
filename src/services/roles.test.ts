import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { RolesService } from "@/services/roles";

describe("RolesService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list calls rolesList", async () => {
    invokeMock.mockResolvedValue([]);
    await RolesService.list();
    expect(invokeMock).toHaveBeenCalledWith("rolesList", undefined);
  });

  it("create maps id/name/description/color/permissions", async () => {
    invokeMock.mockResolvedValue({ id: "qa" });
    await RolesService.create("qa", "QA", "Тестировщики", "#10b981", ["task.view"]);
    expect(invokeMock).toHaveBeenCalledWith("rolesCreate", {
      id: "qa",
      name: "QA",
      description: "Тестировщики",
      color: "#10b981",
      permissions: ["task.view"],
    });
  });

  it("update maps id and the patch", async () => {
    invokeMock.mockResolvedValue({ id: "qa", permissions: ["task.view"] });
    await RolesService.update("qa", { permissions: ["task.view"] });
    expect(invokeMock).toHaveBeenCalledWith("rolesUpdate", {
      id: "qa",
      patch: { permissions: ["task.view"] },
    });
  });

  it("delete maps the role id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await RolesService.delete("qa");
    expect(invokeMock).toHaveBeenCalledWith("rolesDelete", { id: "qa" });
  });
});
