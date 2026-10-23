import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import AnalyticsWidget from "@/components/dashboard/AnalyticsWidget";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import Skeleton from "@/components/ui/Skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryIcon, formatDate } from "@/lib/kbMeta";
import { formatDueDate, PRIORITY_LABELS, priorityColor, statusLabel } from "@/lib/taskMeta";
import { DashboardService, type DashboardSummary } from "@/services/dashboard";
import type { NoteMeta } from "@/services/notes";
import { TasksService, type Task } from "@/services/tasks";
import type { UserSummary } from "@/services/users";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useDashboardStore, WIDGET_DEFS, type WidgetId } from "@/stores/useDashboardStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./DashboardPage.module.css";

export default function DashboardPage(): JSX.Element {
  const displayName = useAuthStore((s) => s.session?.user.displayName ?? "Пользователь");
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const directory = useUserDirectory((s) => s.users);
  const ensureUsers = useUserDirectory((s) => s.ensure);
  const { can } = usePermissions();
  const navigate = useNavigate();
  const config = useDashboardStore((s) => s.config);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const toggleVisible = useDashboardStore((s) => s.toggleVisible);
  const { containerRef, width: gridWidth, mounted } = useContainerWidth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [spaceTasks, setSpaceTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Guards the 30 s polls against overlapping SMB requests.
  const summaryFetchRef = useRef(false);
  const spaceTasksFetchRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (summaryFetchRef.current) {
      return;
    }
    summaryFetchRef.current = true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const result = await DashboardService.getSummary(null);
      if (result.ok) {
        setSummary(result.value);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      summaryFetchRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    // SMB watchers can drop events; refresh the dashboard silently every 30 s.
    const timer = setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // Analytics is scoped to the current space and shares the 30 s fallback poll.
  useEffect(() => {
    if (!spaceId) {
      setSpaceTasks([]);
      return;
    }
    let cancelled = false;
    const fetchSpaceTasks = async () => {
      if (spaceTasksFetchRef.current) {
        return;
      }
      spaceTasksFetchRef.current = true;
      try {
        const result = await TasksService.list(spaceId, {});
        if (!cancelled && result.ok) {
          setSpaceTasks(result.value);
        }
      } finally {
        spaceTasksFetchRef.current = false;
      }
    };
    void fetchSpaceTasks();
    const timer = setInterval(() => void fetchSpaceTasks(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [spaceId]);

  useEffect(() => {
    const ids = Array.from(new Set(spaceTasks.flatMap((task) => task.assignees)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [spaceTasks, ensureUsers]);

  const selectedTask: Task | null =
    selectedTaskId !== null && summary
      ? (summary.myActiveTasks.find((t) => t.id === selectedTaskId) ??
        summary.myTasksToday.find((t) => t.id === selectedTaskId) ??
        summary.myOverdueTasks.find((t) => t.id === selectedTaskId) ??
        null)
      : null;

  const canViewNotes = can("article.view");
  const layout = config.layout.filter((item) => {
    const id = item.i as WidgetId;
    if (id === "notes" && !canViewNotes) {
      return false;
    }
    return config.visible[id] ?? false;
  });

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1>Привет, {displayName}!</h1>
          <span className={styles.date}>{today}</span>
        </div>
        <button
          className={styles.gear}
          type="button"
          title="Настройки дашборда"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </div>

      {loading ? (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={styles.skeletonWidget}>
              <Skeleton height={14} width="45%" />
              <Skeleton height={10} width="85%" />
              <Skeleton height={10} width="65%" />
              <Skeleton height={10} width="75%" />
            </div>
          ))}
        </div>
      ) : null}
      <div ref={containerRef as React.RefObject<HTMLDivElement>} className={styles.gridHost}>
        {summary && mounted ? (
          <GridLayout
            width={gridWidth}
            layout={layout}
            gridConfig={{ cols: 12, rowHeight: 90, margin: [14, 14] }}
            dragConfig={{ handle: ".drag-handle" }}
            onLayoutChange={(next: Layout) => setLayout(next)}
          >
            {WIDGET_DEFS.filter(
              (def) => (def.id !== "notes" || canViewNotes) && (config.visible[def.id] ?? false),
            ).map((def) => (
              <div key={def.id}>
                <div className={styles.widget}>
                  <div className={`${styles.widgetHead} drag-handle`}>
                    <h2>{def.title}</h2>
                  </div>
                  <div className={styles.widgetBody}>
                    <WidgetBody
                      id={def.id}
                      summary={summary}
                      spaceTasks={spaceTasks}
                      directory={directory}
                      canViewNotes={canViewNotes}
                      onOpenTask={setSelectedTaskId}
                      onOpenNote={(id) => navigate(`/app/kb/${id}`)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>

      {settingsOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}>
          <div
            className={styles.settingsCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Настройки дашборда</h3>
            <div className={styles.settingList}>
              {WIDGET_DEFS.map((def) => (
                <label key={def.id} className={styles.settingRow}>
                  <input
                    type="checkbox"
                    checked={config.visible[def.id] ?? false}
                    onChange={() => toggleVisible(def.id)}
                  />
                  {def.title}
                </label>
              ))}
            </div>
            <button className="btn-primary" type="button" onClick={() => setSettingsOpen(false)}>
              Готово
            </button>
          </div>
        </div>
      ) : null}

      {selectedTask && (selectedTask.spaceId ?? spaceId) ? (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          spaceId={selectedTask.spaceId ?? spaceId ?? ""}
          onClose={() => {
            setSelectedTaskId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function WidgetBody({
  id,
  summary,
  spaceTasks,
  directory,
  canViewNotes,
  onOpenTask,
  onOpenNote,
}: {
  id: WidgetId;
  summary: DashboardSummary;
  spaceTasks: Task[];
  directory: Record<string, UserSummary>;
  canViewNotes: boolean;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
}): JSX.Element {
  switch (id) {
    case "active":
      return (
        <TaskList
          tasks={summary.myActiveTasks}
          empty="Активных задач нет."
          showStatus
          onOpen={onOpenTask}
        />
      );
    case "today":
      return (
        <TaskList tasks={summary.myTasksToday} empty="На сегодня задач нет." onOpen={onOpenTask} />
      );
    case "overdue":
      return (
        <TaskList
          tasks={summary.myOverdueTasks}
          empty="Просроченных задач нет."
          overdue
          onOpen={onOpenTask}
        />
      );
    case "stats":
      return (
        <div className={styles.stats}>
          <Stat value={summary.stats.totalTasks} label="Всего задач" />
          <Stat value={summary.stats.inProgress} label="В работе" />
          <Stat value={summary.stats.completedThisWeek} label="Выполнено за неделю" />
        </div>
      );
    case "notes":
      if (!canViewNotes) {
        return <div className={styles.muted}>Нет доступа.</div>;
      }
      return <ArticleList articles={summary.recentArticles} onOpen={onOpenNote} />;
    case "analytics":
      return <AnalyticsWidget tasks={spaceTasks} users={directory} />;
  }
}

function TaskList({
  tasks,
  empty,
  overdue,
  showStatus,
  onOpen,
}: {
  tasks: Task[];
  empty: string;
  overdue?: boolean | undefined;
  showStatus?: boolean | undefined;
  onOpen: (id: string) => void;
}): JSX.Element {
  return tasks.length === 0 ? (
    <div className={styles.muted}>{empty}</div>
  ) : (
    <div className={styles.list}>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          overdue={overdue}
          showStatus={showStatus}
          onOpen={() => onOpen(task.id)}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  overdue,
  showStatus,
  onOpen,
}: {
  task: Task;
  overdue?: boolean | undefined;
  showStatus?: boolean | undefined;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`${styles.taskRow} ${overdue ? styles.taskOverdue : ""}`}
      onClick={onOpen}
    >
      <span className={styles.taskTitle}>
        {task.spaceName ? <span className={styles.spaceBadge}>{task.spaceName}</span> : null}
        {task.title}
      </span>
      <span className={styles.taskMeta}>
        <span style={{ color: priorityColor(task.priority) }}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        {showStatus ? <span>{statusLabel(task.status)}</span> : null}
        {task.dueDate ? <span>📅 {formatDueDate(task.dueDate)}</span> : null}
      </span>
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }): JSX.Element {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function ArticleList({
  articles,
  onOpen,
}: {
  articles: NoteMeta[];
  onOpen: (id: string) => void;
}): JSX.Element {
  return articles.length === 0 ? (
    <div className={styles.muted}>Опубликованных статей пока нет.</div>
  ) : (
    <div className={styles.list}>
      {articles.map((article) => (
        <button
          key={article.id}
          type="button"
          className={styles.articleRow}
          onClick={() => onOpen(article.id)}
        >
          <span className={styles.articleIcon}>{categoryIcon(article.category)}</span>
          <span className={styles.articleBody}>
            <span className={styles.articleTitle}>{article.title}</span>
            <span className={styles.muted}>{formatDate(article.updatedAt)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
