import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { AuthService } from "@/services/auth";

describe("AuthService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("createAdmin maps login/password/fullName", async () => {
    invokeMock.mockResolvedValue({ id: "u1", login: "admin" });
    await AuthService.createAdmin("admin", "secret123", "Алексей");
    expect(invokeMock).toHaveBeenCalledWith("createAdmin", {
      login: "admin",
      password: "secret123",
      fullName: "Алексей",
    });
  });

  it("login calls authLogin", async () => {
    invokeMock.mockResolvedValue({ user: { id: "u1" }, permissions: [] });
    await AuthService.login("admin", "secret123");
    expect(invokeMock).toHaveBeenCalledWith("authLogin", {
      login: "admin",
      password: "secret123",
    });
  });

  it("logout calls authLogout", async () => {
    invokeMock.mockResolvedValue(undefined);
    await AuthService.logout();
    expect(invokeMock).toHaveBeenCalledWith("authLogout", undefined);
  });

  it("changePassword maps oldPassword/newPassword", async () => {
    invokeMock.mockResolvedValue({ user: { id: "u1" }, mustChangePassword: false });
    await AuthService.changePassword("old12345", "new12345");
    expect(invokeMock).toHaveBeenCalledWith("authChangePassword", {
      oldPassword: "old12345",
      newPassword: "new12345",
    });
  });

  it("refreshSession calls authRefreshSession", async () => {
    invokeMock.mockResolvedValue({ user: { id: "u1" }, permissions: [] });
    await AuthService.refreshSession();
    expect(invokeMock).toHaveBeenCalledWith("authRefreshSession", undefined);
  });

  it("register passes email null when omitted", async () => {
    invokeMock.mockResolvedValue({ id: "u2" });
    await AuthService.register("bob", "secret123", "Боб", "observer");
    expect(invokeMock).toHaveBeenCalledWith("authRegister", {
      login: "bob",
      password: "secret123",
      displayName: "Боб",
      roleId: "observer",
      email: null,
    });
  });

  it("resetPassword maps id/newPassword", async () => {
    invokeMock.mockResolvedValue({ id: "u2" });
    await AuthService.resetPassword("u2", "forced123");
    expect(invokeMock).toHaveBeenCalledWith("authResetPassword", {
      id: "u2",
      newPassword: "forced123",
    });
  });
});
