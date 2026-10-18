import {
  avatarColorFor,
  formatDueDate,
  initials,
  isOverdue,
  PRIORITY_LABELS,
} from "@/lib/taskMeta";
import type { Task } from "@/services/tasks";
import type { UserSummary } from "@/services/users";

import styles from "./TaskCard.module.css";

const MAX_AVATARS = 4;

interface TaskCardProps {
  task: Task;
  users: Record<string, UserSummary>;
}

export default function TaskCard({ task, users }: TaskCardProps): JSX.Element {
  const due = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate, task.status);
  const assignees = task.assignees.map(
    (id) => users[id] ?? { id, displayName: "?", avatarColor: avatarColorFor(id) },
  );
  const shown = assignees.slice(0, MAX_AVATARS);
  const extra = assignees.length - shown.length;

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={`${styles.pill} ${styles[task.priority] ?? ""}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      <div className={styles.title}>{task.title}</div>

      {task.tags.length > 0 ? (
        <div className={styles.tags}>
          {task.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.foot}>
        <div className={styles.avatars}>
          {shown.map((user) => (
            <span
              key={user.id}
              className={styles.avatar}
              style={{ background: user.avatarColor }}
              title={user.displayName}
            >
              {initials(user.displayName)}
            </span>
          ))}
          {extra > 0 ? <span className={styles.more}>+{extra}</span> : null}
        </div>
        {due ? (
          <span className={`${styles.due} ${overdue ? styles.overdue : ""}`}>📅 {due}</span>
        ) : null}
      </div>
    </div>
  );
}
