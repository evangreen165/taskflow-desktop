import { create } from "zustand";
import type { Layout } from "react-grid-layout";

export type WidgetId = "active" | "today" | "overdue" | "stats" | "notes" | "analytics";

export const WIDGET_DEFS: { id: WidgetId; title: string }[] = [
  { id: "active", title: "Мои активные задачи" },
  { id: "today", title: "Задачи на сегодня" },
  { id: "overdue", title: "Просроченные" },
  { id: "stats", title: "Статистика" },
  { id: "notes", title: "Последние заметки" },
  { id: "analytics", title: "Аналитика" },
];

export interface DashboardConfig {
  layout: Layout;
  visible: Record<WidgetId, boolean>;
}

const STORAGE_KEY = "taskflow.dashboard";

function defaultLayout(): Layout {
  return [
    { i: "active", x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
    { i: "today", x: 4, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
    { i: "overdue", x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
    { i: "stats", x: 0, y: 4, w: 4, h: 2, minW: 3, minH: 2 },
    { i: "notes", x: 4, y: 4, w: 4, h: 4, minW: 3, minH: 3 },
    { i: "analytics", x: 8, y: 4, w: 4, h: 5, minW: 4, minH: 4 },
  ];
}

function defaultVisible(): Record<WidgetId, boolean> {
  return {
    active: true,
    today: true,
    overdue: true,
    stats: true,
    notes: true,
    analytics: true,
  };
}

function readInitial(): DashboardConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardConfig;
      if (Array.isArray(parsed.layout) && parsed.visible && typeof parsed.visible === "object") {
        // Merge widgets added in newer versions into an existing saved layout.
        const layout = [...parsed.layout];
        for (const item of defaultLayout()) {
          if (!layout.some((entry) => entry.i === item.i)) {
            layout.push(item);
          }
        }
        return {
          layout,
          visible: { ...defaultVisible(), ...parsed.visible },
        };
      }
    }
  } catch {
    // No localStorage or corrupt data.
  }
  return { layout: defaultLayout(), visible: defaultVisible() };
}

function persist(config: DashboardConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

interface DashboardState {
  config: DashboardConfig;
  setLayout: (layout: Layout) => void;
  toggleVisible: (id: WidgetId) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  config: readInitial(),
  setLayout: (layout) =>
    set((state) => {
      const next = { ...state.config, layout };
      persist(next);
      return { config: next };
    }),
  toggleVisible: (id) =>
    set((state) => {
      const next = {
        ...state.config,
        visible: { ...state.config.visible, [id]: !state.config.visible[id] },
      };
      persist(next);
      return { config: next };
    }),
}));
