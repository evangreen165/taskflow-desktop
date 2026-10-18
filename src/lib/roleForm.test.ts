import { describe, expect, it } from "vitest";

import { canDeleteRole, slugifyRoleId, validateRoleDraft } from "@/lib/roleForm";

describe("slugifyRoleId", () => {
  it("transliterates Cyrillic names into a backend-safe id", () => {
    expect(slugifyRoleId("Тестировщик", [])).toBe("testirovschik");
    expect(slugifyRoleId("Автор KB", [])).toBe("avtor_kb");
  });

  it("slugifies latin names and strips punctuation", () => {
    expect(slugifyRoleId("QA Lead!", [])).toBe("qa_lead");
  });

  it("de-duplicates against existing ids", () => {
    expect(slugifyRoleId("QA Lead", ["qa_lead"])).toBe("qa_lead_2");
    expect(slugifyRoleId("QA Lead", ["qa_lead", "qa_lead_2"])).toBe("qa_lead_3");
  });

  it("produces a non-empty id for empty input", () => {
    const id = slugifyRoleId("   ", []);
    expect(id.startsWith("role_")).toBe(true);
    expect(id.length).toBeGreaterThan(5);
  });
});

describe("validateRoleDraft", () => {
  it("requires a name", () => {
    expect(validateRoleDraft({ name: "  ", permissions: ["task.view"] })).toBe(
      "Укажите название роли.",
    );
  });

  it("requires at least one permission", () => {
    expect(validateRoleDraft({ name: "QA", permissions: [] })).toBe("Выберите хотя бы одно право.");
  });

  it("accepts a name with one permission", () => {
    expect(validateRoleDraft({ name: "QA", permissions: ["task.view"] })).toBeNull();
  });
});

describe("canDeleteRole", () => {
  it("allows custom roles and blocks system roles", () => {
    expect(canDeleteRole({ isSystem: false })).toBe(true);
    expect(canDeleteRole({ isSystem: true })).toBe(false);
  });
});
