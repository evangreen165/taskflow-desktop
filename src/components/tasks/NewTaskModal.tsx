import { useState } from "react";

import { KANBAN_COLUMNS, PRIORITY_LABELS } from "@/lib/taskMeta";
import { TasksService, type Task, type TaskPriority, type TaskStatus } from "@/services/tasks";

import styles from "./NewTaskModal.module.css";

interface NewTaskModalProps {
  initialStatus: TaskStatus;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export default function NewTaskModal({
  initialStatus,
  onClose,
  onCreated,
}: NewTaskModalProps): JSX.Element {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!title.trim()) {
      setError("Укажите название задачи.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await TasksService.create({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onCreated(result.value);
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Новая задача"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Новая задача</h2>

        {error ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="nt-title">Название</label>
          <input
            id="nt-title"
            type="text"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="nt-description">Описание</label>
          <textarea
            id="nt-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className="field">
            <label htmlFor="nt-priority">Приоритет</label>
            <select
              id="nt-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nt-status">Статус</label>
            <select
              id="nt-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {KANBAN_COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
