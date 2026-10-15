import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { UsersService } from "@/services/users";

describe("UsersService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list calls usersList", async () => {
    invokeMock.mockResolvedValue([]);
    await UsersService.list();
    expect(invokeMock).toHaveBeenCalledWith("usersList", undefined);
  });

  it("update maps id and the patch", async () => {
    invokeMock.mockResolvedValue({ id: "u1", displayName: "Новое" });
    await UsersService.update("u1", { displayName: "Новое", email: null });
    expect(invokeMock).toHaveBeenCalledWith("usersUpdate", {
      id: "u1",
      patch: { displayName: "Новое", email: null },
    });
  });

  it("deactivate maps the user id", async () => {
    invokeMock.mockResolvedValue({ id: "u1", isActive: false });
    await UsersService.deactivate("u1");
    expect(invokeMock).toHaveBeenCalledWith("usersDeactivate", { id: "u1" });
  });
});
