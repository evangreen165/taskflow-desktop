import {
  formatDueDate,
  initials,
  PRIORITY_LABELS,
  priorityColor,
  statusLabel,
} from "@/lib/taskMeta";
import type { Task, TaskStatus } from "@/services/tasks";
import type { UserSummary } from "@/services/users";

import styles from "./TaskListView.module.css";

interface TaskListViewProps {
  tasks: Task[];
  users: Record<string, UserSummary>;
  onSelect: (task: Task) => void;
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  new: styles.statusNew ?? "",
  in_progress: styles.statusInProgress ?? "",
  review: styles.statusReview ?? "",
  done: styles.statusDone ?? "",
  rejected: styles.statusRejected ?? "",
};

const MAX_AVATARS = 3;

export default function TaskListView({ tasks, users, onSelect }: TaskListViewProps): JSX.Element {
  return (
    <div className={styles.list}>
      {tasks.map((task) => {
        const due = formatDueDate(task.dueDate);
        const assignees = task.assignees.map(
          (id) => users[id] ?? { id, displayName: "?", avatarColor: "#5b5bd6" },
        );
        return (
          <button key={task.id} type="button" className={styles.row} onClick={() => onSelect(task)}>
            <span className={`${styles.status} ${STATUS_CLASS[task.status]}`}>
              {statusLabel(task.status)}
            </span>
            <span className={styles.title}>{task.title}</span>
            <span className={styles.priority} style={{ color: priorityColor(task.priority) }}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            <span className={styles.assignees}>
              {assignees.slice(0, MAX_AVATARS).map((user) => (
                <span
                  key={user.id}
                  className={styles.avatar}
                  style={{ background: user.avatarColor }}
                  title={user.displayName}
                >
                  {initials(user.displayName)}
                </span>
              ))}
              {assignees.length > MAX_AVATARS ? (
                <span className={styles.more}>+{assignees.length - MAX_AVATARS}</span>
              ) : null}
            </span>
            <span className={styles.due}>{due ? `📅 ${due}` : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
