import { describe, expect, it } from "vitest";

import { AppError, err, ok, unwrap } from "@/lib/errors";

describe("AppError.from", () => {
  it("normalizes a plain string", () => {
    const error = AppError.from("boom");
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("boom");
  });

  it("parses the backend { code, message, details } shape", () => {
    const error = AppError.from({ code: "NOT_FOUND", message: "missing", details: "extra" });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("missing");
    expect(error.details).toBe("extra");
    expect(error.isNotFound).toBe(true);
  });

  it("passes an existing AppError through unchanged", () => {
    const original = new AppError({ code: "LOCKED", message: "held" });
    expect(AppError.from(original)).toBe(original);
  });

  it("falls back to INTERNAL for unknown values", () => {
    expect(AppError.from(null).code).toBe("INTERNAL");
    expect(AppError.from(42).message).toBe("42");
    expect(AppError.from(undefined).message).toBe("unknown error");
  });

  it("exposes helpers for common codes", () => {
    expect(new AppError({ code: "AUTH_FAILED", message: "x" }).isAuthFailure).toBe(true);
    expect(new AppError({ code: "LOCKED", message: "x" }).isLocked).toBe(true);
  });
});

describe("Result", () => {
  it("ok() carries the value and unwrap returns it", () => {
    const result = ok(7);
    expect(result.ok).toBe(true);
    expect(unwrap(result)).toBe(7);
  });

  it("err() carries the error and unwrap throws it", () => {
    const error = new AppError({ code: "IO", message: "disk" });
    const result = err(error);
    expect(result.ok).toBe(false);
    expect(() => unwrap(result)).toThrow(error);
  });
});
