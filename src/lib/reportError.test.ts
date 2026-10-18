import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, navigateMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/lib/navigate", () => ({ appNavigate: navigateMock, setAppNavigator: vi.fn() }));

import { AppError } from "@/lib/errors";
import { reportAppError } from "@/lib/reportError";
import type { SessionView } from "@/services/types";
import { useAuthStore } from "@/stores/useAuthStore";

const session: SessionView = {
  user: {
    id: "u1",
    login: "admin",
    displayName: "Админ",
    email: null,
    roleId: "admin",
    avatarColor: "#5b5bd6",
    createdAt: "2026-10-01T00:00:00Z",
    lastLoginAt: null,
    isActive: true,
    mustChangePassword: false,
  },
  role: { id: "admin", name: "Администратор", color: "#5b5bd6" },
  permissions: ["task.view"],
  loginAt: "2026-10-01T00:00:00Z",
  mustChangePassword: false,
};

describe("reportAppError", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    navigateMock.mockReset();
    useAuthStore.setState({ session: null });
  });

  it("AUTH_REQUIRED without a session stays silent (no logout audit)", () => {
    reportAppError(new AppError({ code: "AUTH_REQUIRED", message: "auth required" }));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });

  it("AUTH_REQUIRED with an existing session logs out", () => {
    useAuthStore.setState({ session });
    reportAppError(new AppError({ code: "AUTH_REQUIRED", message: "expired" }));
    expect(invokeMock).toHaveBeenCalledWith("authLogout", undefined);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });

  it("PASSWORD_CHANGE_REQUIRED redirects to the profile", () => {
    reportAppError(new AppError({ code: "PASSWORD_CHANGE_REQUIRED", message: "change password" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/profile");
  });

  it("SESSION_INVALIDATED logs out and toasts", () => {
    reportAppError(new AppError({ code: "SESSION_INVALIDATED", message: "migrated" }));
    expect(invokeMock).toHaveBeenCalledWith("authLogout", undefined);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });
});
