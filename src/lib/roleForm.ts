/** Pure helpers for the role-creation form (auto id, validation, delete rules). */

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/**
 * Derives a backend-safe role id (`[a-z0-9_]{1,32}`) from a display name:
 * transliterates Cyrillic, slugifies, and de-duplicates against existing ids.
 */
export function slugifyRoleId(name: string, existingIds: readonly string[]): string {
  const transliterated = name
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("");

  let base = transliterated
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);

  if (base.length === 0) {
    base = `role_${Math.random().toString(36).slice(2, 8)}`;
  }

  let id = base;
  let suffix = 2;
  while (existingIds.includes(id)) {
    id = `${base}_${suffix}`.slice(0, 32);
    suffix += 1;
  }
  return id;
}

export interface RoleDraftInput {
  name: string;
  permissions: readonly string[];
}

/** A role needs a name and at least one permission. Returns an error or null. */
export function validateRoleDraft(draft: RoleDraftInput): string | null {
  if (!draft.name.trim()) {
    return "Укажите название роли.";
  }
  if (draft.permissions.length === 0) {
    return "Выберите хотя бы одно право.";
  }
  return null;
}

/** System roles are protected; custom roles may be deleted (if unused). */
export function canDeleteRole(role: { isSystem: boolean }): boolean {
  return !role.isSystem;
}
