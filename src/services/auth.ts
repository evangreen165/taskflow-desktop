import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { SessionView, UserInfo } from "@/services/types";

export const AuthService = {
  /** Onboarding: creates the first administrator (pre-session). */
  createAdmin(login: string, password: string, fullName: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("createAdmin", { login, password, fullName });
  },

  login(login: string, password: string): Promise<Result<SessionView>> {
    return invokeCommand<SessionView>("authLogin", { login, password });
  },

  logout(): Promise<Result<void>> {
    return invokeCommand<void>("authLogout");
  },

  changePassword(oldPassword: string, newPassword: string): Promise<Result<SessionView>> {
    return invokeCommand<SessionView>("authChangePassword", { oldPassword, newPassword });
  },

  refreshSession(): Promise<Result<SessionView>> {
    return invokeCommand<SessionView>("authRefreshSession");
  },

  /**
   * "Remember me": verifies credentials and returns a machine-local token
   * (HMAC-bound to the user's password hash) for the store.
   */
  loginRemember(login: string, password: string): Promise<Result<{ token: string }>> {
    return invokeCommand<{ token: string }>("authLoginRemember", { login, password });
  },

  /** Restores a session from a machine-local remember-me token. */
  autoLogin(token: string): Promise<Result<SessionView>> {
    return invokeCommand<SessionView>("authAutoLogin", { token });
  },

  register(
    login: string,
    password: string,
    displayName: string,
    roleId: string,
    email?: string | null,
  ): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("authRegister", {
      login,
      password,
      displayName,
      roleId,
      email: email ?? null,
    });
  },

  resetPassword(id: string, newPassword: string): Promise<Result<UserInfo>> {
    return invokeCommand<UserInfo>("authResetPassword", { id, newPassword });
  },
};
