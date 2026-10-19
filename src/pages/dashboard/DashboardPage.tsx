import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryIcon, formatDate } from "@/lib/kbMeta";
import { PRIORITY_LABELS, priorityColor, formatDueDate } from "@/lib/taskMeta";
import { DashboardService, type DashboardSummary } from "@/services/dashboard";
import type { Task } from "@/services/tasks";
import { useAuthStore } from "@/stores/useAuthStore";

import styles from "./DashboardPage.module.css";

export default function DashboardPage(): JSX.Element {
  const displayName = useAuthStore((s) => s.session?.user.displayName ?? "Пользователь");
  const { can } = usePermissions();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await DashboardService.getSummary();
    if (result.ok) {
      setSummary(result.value);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTask: Task | null =
    selectedTaskId !== null && summary
      ? (summary.myTasksToday.find((t) => t.id === selectedTaskId) ??
        summary.myOverdueTasks.find((t) => t.id === selectedTaskId) ??
        null)
      : null;

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1>Привет, {displayName}!</h1>
        <span className={styles.date}>{today}</span>
      </div>

      {loading ? <div className={styles.muted}>Загрузка…</div> : null}

      {summary ? (
        <div className={styles.grid}>
          <section className={styles.widget}>
            <h2>Мои задачи на сегодня</h2>
            {summary.myTasksToday.length === 0 ? (
              <div className={styles.muted}>На сегодня задач нет.</div>
            ) : (
              <div className={styles.list}>
                {summary.myTasksToday.map((task) => (
                  <TaskRow key={task.id} task={task} onOpen={() => setSelectedTaskId(task.id)} />
                ))}
              </div>
            )}
          </section>

          <section className={styles.widget}>
            <h2>Просроченные</h2>
            {summary.myOverdueTasks.length === 0 ? (
              <div className={styles.muted}>Просроченных задач нет.</div>
            ) : (
              <div className={styles.list}>
                {summary.myOverdueTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    overdue
                    onOpen={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={styles.widget}>
            <h2>Статистика</h2>
            <div className={styles.stats}>
              <Stat value={summary.stats.totalTasks} label="Всего задач" />
              <Stat value={summary.stats.inProgress} label="В работе" />
              <Stat value={summary.stats.completedThisWeek} label="Выполнено за неделю" />
            </div>
          </section>

          {can("article.view") ? (
            <section className={styles.widget}>
              <h2>Последние статьи</h2>
              {summary.recentArticles.length === 0 ? (
                <div className={styles.muted}>Опубликованных статей пока нет.</div>
              ) : (
                <div className={styles.list}>
                  {summary.recentArticles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      className={styles.articleRow}
                      onClick={() => navigate(`/app/kb/${article.id}`)}
                    >
                      <span className={styles.articleIcon}>{categoryIcon(article.category)}</span>
                      <span className={styles.articleBody}>
                        <span className={styles.articleTitle}>{article.title}</span>
                        <span className={styles.muted}>{formatDate(article.updatedAt)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => {
            setSelectedTaskId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  overdue,
  onOpen,
}: {
  task: Task;
  overdue?: boolean;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`${styles.taskRow} ${overdue ? styles.taskOverdue : ""}`}
      onClick={onOpen}
    >
      <span className={styles.taskTitle}>{task.title}</span>
      <span className={styles.taskMeta}>
        <span style={{ color: priorityColor(task.priority) }}>
          {PRIORITY_LABELS[task.priority]}
        </span>
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
