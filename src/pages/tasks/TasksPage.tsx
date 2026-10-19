import { useEffect, useState } from "react";

import KanbanBoard from "@/components/tasks/KanbanBoard";
import NewTaskModal from "@/components/tasks/NewTaskModal";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import { messageForCode } from "@/lib/errorMessages";
import type { TaskStatus } from "@/services/tasks";
import { useTaskStore } from "@/stores/useTaskStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./TasksPage.module.css";

/** Codes the global error handler already toasts (avoid double toasts). */
const GLOBAL_TOAST_CODES = new Set([
  "FORBIDDEN",
  "ROLE_EMPTY",
  "LAST_ADMIN",
  "ROLE_NOT_FOUND",
  "SESSION_INVALIDATED",
]);

export default function TasksPage(): JSX.Element {
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const addTask = useTaskStore((s) => s.addTask);
  const moveTask = useTaskStore((s) => s.moveTask);

  const users = useUserDirectory((s) => s.users);
  const ensureUsers = useUserDirectory((s) => s.ensure);
  const pushToast = useToastStore((s) => s.push);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const ids = Array.from(new Set(tasks.flatMap((task) => task.assignees)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [tasks, ensureUsers]);

  function openModal(status: TaskStatus): void {
    setModalStatus(status);
    setModalOpen(true);
  }

  async function handleMove(id: string, status: TaskStatus, version: number): Promise<void> {
    const error = await moveTask(id, status, version);
    if (error && !GLOBAL_TOAST_CODES.has(error.code)) {
      pushToast(messageForCode(error.code, error.message), "error");
    }
  }

  const selectedTask =
    selectedId !== null ? (tasks.find((task) => task.id === selectedId) ?? null) : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Задачи</h1>
        <button className="btn-primary" type="button" onClick={() => openModal("new")}>
          Новая задача
        </button>
      </div>

      {loading ? <div className={styles.loading}>Загрузка задач…</div> : null}

      <KanbanBoard
        tasks={tasks}
        users={users}
        onMove={(id, status, version) => void handleMove(id, status, version)}
        onAdd={openModal}
        onSelect={(task) => setSelectedId(task.id)}
      />

      {modalOpen ? (
        <NewTaskModal
          initialStatus={modalStatus}
          onClose={() => setModalOpen(false)}
          onCreated={addTask}
        />
      ) : null}

      {selectedTask ? (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
