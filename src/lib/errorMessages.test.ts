import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, messageForCode } from "@/lib/errorMessages";
import { KNOWN_ERROR_CODES } from "@/lib/errors";

describe("errorMessages", () => {
  it("maps every known ErrorCode to a non-empty message", () => {
    for (const code of KNOWN_ERROR_CODES) {
      const message = ERROR_MESSAGES[code];
      expect(typeof message, `missing message for ${code}`).toBe("string");
      expect((message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("maps migration outcome codes to Russian messages", () => {
    expect(messageForCode("SESSION_INVALIDATED")).toBe("Миграция завершена, войдите заново");
    expect(messageForCode("MIGRATION_FAILED")).toBe(
      "Миграция не удалась, обратитесь к администратору",
    );
  });

  it("falls back to the raw code for unknown codes", () => {
    expect(messageForCode("NO_SUCH_CODE")).toBe("NO_SUCH_CODE");
    expect(messageForCode("NO_SUCH_CODE", "fallback")).toBe("fallback");
  });
});
