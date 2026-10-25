import { useEffect, useMemo, useState } from "react";
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

type ChartMode = "status" | "executor";

/**
 * Dashboard analytics for the current space. One chart at a time (status donut
 * or assignee workload) so it fills the widget; switchable from the segmented
 * control at the top.
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
  const [mode, setMode] = useState<ChartMode>("status");

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
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="tablist" aria-label="Тип графика">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "status"}
            className={mode === "status" ? styles.segActive : ""}
            onClick={() => setMode("status")}
          >
            По статусам
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "executor"}
            className={mode === "executor" ? styles.segActive : ""}
            onClick={() => setMode("executor")}
          >
            По исполнителям
          </button>
        </div>
      </div>

      <div className={styles.chartWrap}>
        {mode === "status" ? (
          statusData.length === 0 ? (
            <div className={styles.empty}>Нет задач в выбранных статусах.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={true}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />
              </PieChart>
            </ResponsiveContainer>
          )
        ) : workloadData.length === 0 ? (
          <div className={styles.empty}>Нет активных задач с исполнителями.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
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
      </div>
    </div>
  );
}
