import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { NoteMeta } from "@/services/notes";
import type { Task } from "@/services/tasks";

export interface DashboardStats {
  totalTasks: number;
  inProgress: number;
  completedThisWeek: number;
}

export interface DashboardSummary {
  myActiveTasks: Task[];
  myTasksToday: Task[];
  myOverdueTasks: Task[];
  recentArticles: NoteMeta[];
  stats: DashboardStats;
}

export const DashboardService = {
  getSummary(spaceId: string | null): Promise<Result<DashboardSummary>> {
    return invokeCommand<DashboardSummary>("dashboardSummary", { spaceId });
  },
};
