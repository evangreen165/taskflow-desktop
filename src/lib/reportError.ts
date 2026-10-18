import type { AppError } from "@/lib/errors";
import { messageForCode } from "@/lib/errorMessages";
import { appNavigate } from "@/lib/navigate";
import { useAuthStore } from "@/stores/useAuthStore";
import { useToastStore } from "@/stores/useToastStore";

/**
 * Centralized handling for the auth/permission error codes. Components must
 * NOT interpret these codes themselves; they only render the message.
 */
export function reportAppError(error: AppError): void {
  switch (error.code) {
    case "AUTH_REQUIRED": {
      // Cold boot / unauthenticated calls must stay silent: only invalidate a
      // session that actually existed (avoids a spurious audit `auth.logout`).
      if (useAuthStore.getState().session !== null) {
        void useAuthStore.getState().logout();
      }
      appNavigate("/login");
      break;
    }
    case "SESSION_INVALIDATED":
      void useAuthStore.getState().logout();
      useToastStore.getState().push(messageForCode("SESSION_INVALIDATED"));
      appNavigate("/login");
      break;
    case "ROLE_NOT_FOUND":
      void useAuthStore.getState().logout();
      useToastStore.getState().push(messageForCode("ROLE_NOT_FOUND"));
      appNavigate("/login");
      break;
    case "PASSWORD_CHANGE_REQUIRED":
      appNavigate("/app/profile");
      break;
    case "FORBIDDEN":
      useToastStore.getState().push("Недостаточно прав");
      break;
    case "ROLE_EMPTY":
      useToastStore.getState().push(messageForCode("ROLE_EMPTY"));
      break;
    case "LAST_ADMIN":
      useToastStore.getState().push(messageForCode("LAST_ADMIN"));
      break;
    default:
      break;
  }
}
