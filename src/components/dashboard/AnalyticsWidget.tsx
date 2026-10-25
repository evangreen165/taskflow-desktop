import { useEffect, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { statusLabel } from "@/lib/taskMeta";
import type { Task, TaskStatus } from "@/services/tasks";
import type { UserSummary } from "@/services/users";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useTaskStore } from "@/stores/useTaskStore";

import styles from "./AnalyticsWidget.module.css";

/** Colors mirror the global tokens in `src/styles/global.css`. */
const STATUS_COLORS: Record<TaskStatus, string> = {
  new: "var(--blue)",
  in_progress: "var(--amber)",
  review: "var(--accent)",
  done: "var(--green)",
  rejected: "var(--red)",
  trash: "var(--text-muted)",
};

const PIE_STATUSES: TaskStatus[] = ["new", "in_progress", "review", "done"];

const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 12,
};

/**
 * Dashboard analytics for the current space: tasks by status (pie) and active
 * task workload per assignee (bar).
 */
export default function AnalyticsWidget({
  tasks,
  users,
}: {
  tasks: Task[];
  users: Record<string, UserSummary>;
}): JSX.Element {
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const storeTasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  /**
   * Charts must not flash empty after tab switches: the widget remounts while
   * the parent refetches. If the shared task store already holds the current
   * space's tasks, use them instead of issuing a duplicate request.
   */
  useEffect(() => {
    if (!spaceId || tasks.length > 0) {
      return;
    }
    const store = useTaskStore.getState();
    if (store.tasks.length > 0 || store.loading) {
      return;
    }
    void fetchTasks(spaceId);
  }, [fetchTasks, spaceId, tasks.length]);

  const chartTasks = tasks.length > 0 ? tasks : storeTasks;

  const statusData = useMemo(
    () =>
      PIE_STATUSES.map((status) => ({
        status,
        name: statusLabel(status),
        value: chartTasks.filter((task) => task.status === status).length,
        color: STATUS_COLORS[status],
      })).filter((item) => item.value > 0),
    [chartTasks],
  );

  const workloadData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of chartTasks) {
      if (task.status === "done" || task.status === "rejected") {
        continue;
      }
      for (const assignee of task.assignees) {
        counts.set(assignee, (counts.get(assignee) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        name: users[id]?.displayName ?? id.slice(0, 8),
        tasks: count,
      }))
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 8);
  }, [chartTasks, users]);

  if (chartTasks.length === 0) {
    return <div className={styles.empty}>В этом пространстве пока нет задач.</div>;
  }

  return (
    <div className={styles.analytics}>
      <section className={styles.block}>
        <h3 className={styles.title}>Задачи по статусам</h3>
        {statusData.length === 0 ? (
          <div className={styles.empty}>Нет задач в выбранных статусах.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300} minWidth={200}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={32}
                outerRadius={58}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={true}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.status} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className={styles.block}>
        <h3 className={styles.title}>Загрузка исполнителей</h3>
        {workloadData.length === 0 ? (
          <div className={styles.empty}>Нет активных задач с исполнителями.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300} minWidth={200}>
            <BarChart data={workloadData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={40}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--surface-2)" }} />
              <Bar
                dataKey="tasks"
                name="Активные задачи"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
