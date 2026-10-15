/**
 * Unified error handling for the frontend.
 *
 * Every Tauri command resolves to `Result<T, AppError>`; the Rust side
 * serializes errors as `{ code, message, details? }` and this module turns
 * any thrown/rejected value into a typed `AppError`.
 */

export const KNOWN_ERROR_CODES = [
  "IO",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "PERMISSION_DENIED",
  "PARSE",
  "INVALID_PATH",
  "INVALID_INPUT",
  "NOT_WORKSPACE",
  "SCHEMA_TOO_NEW",
  "NO_WORKSPACE",
  "LOCKED",
  "AUTH_FAILED",
  "AUTH_HASH",
  "WATCH",
  "LOG_INIT",
  "INTERNAL",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "PASSWORD_CHANGE_REQUIRED",
  "SESSION_INVALIDATED",
  "ROLE_NOT_FOUND",
  "SELF_RESET_FORBIDDEN",
  "MIGRATION_FAILED",
  "MIGRATION_LOCKED",
  "MIGRATION_LOCK_LOST",
  "ROLE_EMPTY",
  "LAST_ADMIN",
  "FORBIDDEN_PATH",
  "ROLE_FIXED",
  "ROLE_SYSTEM",
  "ROLE_IN_USE",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];
/** Known codes keep autocomplete; unknown backend codes stay valid strings. */
export type ErrorCode = KnownErrorCode | (string & {});

export interface AppErrorInit {
  code: string;
  message: string;
  details?: string | undefined;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: string | undefined;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.name = "AppError";
    this.code = init.code;
    this.details = init.details;
  }

  get isAuthFailure(): boolean {
    return this.code === "AUTH_FAILED";
  }

  get isNotFound(): boolean {
    return this.code === "NOT_FOUND";
  }

  get isLocked(): boolean {
    return this.code === "LOCKED";
  }

  static from(cause: unknown): AppError {
    if (cause instanceof AppError) {
      return cause;
    }
    if (typeof cause === "string") {
      return new AppError({ code: "INTERNAL", message: cause });
    }
    if (isRecord(cause)) {
      const code = typeof cause.code === "string" ? cause.code : "INTERNAL";
      const message = typeof cause.message === "string" ? cause.message : safeStringify(cause);
      const details = typeof cause.details === "string" ? cause.details : undefined;
      return new AppError({ code, message, details });
    }
    return new AppError({ code: "INTERNAL", message: safeStringify(cause) });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeStringify(value: unknown): string {
  if (value === undefined) {
    return "unknown error";
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function errorMessage(cause: unknown): string {
  return AppError.from(cause).message;
}

/** Discriminated result type shared by every service call. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: AppError): Result<never> {
  return { ok: false, error };
}

/** Returns the value or throws the `AppError`. */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}
