import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export type NotificationType = "task_assigned" | "comment_mention" | "space_added";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkTo: string | null;
  isRead: boolean;
  createdAt: string;
}

export const NotificationsService = {
  list(): Promise<Result<Notification[]>> {
    return invokeCommand<Notification[]>("notificationsList");
  },

  markRead(id: string): Promise<Result<void>> {
    return invokeCommand<void>("notificationsMarkRead", { id });
  },

  markAllRead(): Promise<Result<void>> {
    return invokeCommand<void>("notificationsMarkAllRead");
  },
};
