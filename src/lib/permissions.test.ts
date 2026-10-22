import { describe, expect, it } from "vitest";

import { ALL_PERMISSIONS, can, PERMISSION_GROUPS } from "@/lib/permissions";

describe("can", () => {
  it("implements the permission truth table", () => {
    expect(can(["task.view"], "task.view")).toBe(true);
    expect(can(["task.view"], "task.create")).toBe(false);
    expect(can([], "task.view")).toBe(false);
    expect(can(["task.view", "article.view"], "article.view")).toBe(true);
    expect(can(["task.view"], "article.view")).toBe(false);
    expect(can(["users.manage"], "roles.manage")).toBe(false);
  });
});

describe("permission groups", () => {
  it("cover exactly the 18-registry permission set without duplicates", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions);
    expect(grouped).toHaveLength(18);
    expect(new Set(grouped).size).toBe(18);
    expect(ALL_PERMISSIONS).toEqual(grouped);
  });

  it("group labels and prefixes are stable", () => {
    expect(PERMISSION_GROUPS.map((g) => g.id)).toEqual([
      "task",
      "article",
      "users",
      "roles",
      "audit",
      "workspace",
      "space",
    ]);
    for (const group of PERMISSION_GROUPS) {
      for (const perm of group.permissions) {
        expect(perm.startsWith(`${group.id}.`)).toBe(true);
      }
    }
  });
});
