import { describe, expect, it } from "vitest";

import { messageForCode } from "@/lib/errorMessages";

describe("errorMessages", () => {
  it("maps migration outcome codes to Russian messages", () => {
    expect(messageForCode("SESSION_INVALIDATED")).toBe("Миграция завершена, войдите заново");
    expect(messageForCode("MIGRATION_FAILED")).toBe("Миграция не удалась, обратитесь к администратору");
  });

  it("falls back to the raw code for unknown codes", () => {
    expect(messageForCode("NO_SUCH_CODE")).toBe("NO_SUCH_CODE");
    expect(messageForCode("NO_SUCH_CODE", "fallback")).toBe("fallback");
  });
});
