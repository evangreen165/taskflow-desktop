import type { NoteListItem, NoteStatus } from "@/services/notes";

const CATEGORY_ICONS: Record<string, string> = {
  Онбординг: "🚀",
  Процессы: "⚙️",
  Разработка: "💻",
  Дизайн: "🎨",
  HR: "🧑‍💼",
};

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "📄";
}

export function truncatePreview(preview: string, max = 120): string {
  if (preview.length <= max) {
    return preview;
  }
  return `${preview.slice(0, max).trimEnd()}…`;
}

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  draft: "Черновик",
  published: "Опубликована",
  archived: "В архиве",
};

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export interface KbFilter {
  category: string | null;
  status: "all" | "published" | "mine";
  search: string;
}

export const EMPTY_KB_FILTER: KbFilter = {
  category: null,
  status: "all",
  search: "",
};

/** Client-side filtering of the loaded note list (category/status/search). */
export function filterNoteItems(
  items: readonly NoteListItem[],
  filter: KbFilter,
  currentUserId: string | null,
): NoteListItem[] {
  const query = filter.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter.category !== null && item.category !== filter.category) {
      return false;
    }
    if (filter.status === "published" && item.status !== "published") {
      return false;
    }
    if (filter.status === "mine" && !(item.status === "draft" && item.authorId === currentUserId)) {
      return false;
    }
    if (query !== "") {
      const haystack = `${item.title} ${item.category} ${item.preview}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}
