import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import KanbanBoard from "@/components/tasks/KanbanBoard";
import NewTaskModal from "@/components/tasks/NewTaskModal";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import TaskListView from "@/components/tasks/TaskListView";
import { messageForCode } from "@/lib/errorMessages";
import {
  EMPTY_TASK_FILTER,
  filterTasks,
  isFilterActive,
  type TaskFilterState,
} from "@/lib/filterTasks";
import { PRIORITY_LABELS } from "@/lib/taskMeta";
import type { TaskPriority, TaskStatus } from "@/services/tasks";
import { startTaskWatcher } from "@/stores/taskWatcher";
import { useSpaceStore } from "@/stores/useSpaceStore";
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

type BoardView = "kanban" | "list";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export default function TasksPage(): JSX.Element {
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchTasksSilently = useTaskStore((s) => s.fetchTasksSilently);
  const addTask = useTaskStore((s) => s.addTask);
  const moveTask = useTaskStore((s) => s.moveTask);

  const users = useUserDirectory((s) => s.users);
  const allUsers = useUserDirectory((s) => s.all);
  const ensureUsers = useUserDirectory((s) => s.ensure);
  const loadAll = useUserDirectory((s) => s.loadAll);
  const pushToast = useToastStore((s) => s.push);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<BoardView>("kanban");
  const [filter, setFilter] = useState<TaskFilterState>(EMPTY_TASK_FILTER);
  const [searchParams, setSearchParams] = useSearchParams();
  const taskParam = searchParams.get("task");

  const filteredTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  const filterActive = isFilterActive(filter);

  useEffect(() => {
    if (spaceId) {
      void fetchTasks(spaceId);
    }
  }, [fetchTasks, spaceId]);

  // Deep link from the command palette: /app/tasks?task=<id>.
  useEffect(() => {
    if (taskParam) {
      setSelectedId(taskParam);
    }
  }, [taskParam]);

  // Live updates: another machine or an external editor changing tasks/ files.
  useEffect(() => {
    const unsubscribe = startTaskWatcher();
    return unsubscribe;
  }, []);

  // SMB watchers can drop events; poll every 30 s as a silent fallback.
  useEffect(() => {
    if (!spaceId) {
      return;
    }
    const timer = setInterval(() => {
      void fetchTasksSilently(spaceId);
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchTasksSilently, spaceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const ids = Array.from(new Set(tasks.flatMap((task) => task.assignees)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [tasks, ensureUsers]);

  const selectedTask =
    selectedId !== null ? (tasks.find((task) => task.id === selectedId) ?? null) : null;

  function openModal(status: TaskStatus): void {
    setModalStatus(status);
    setModalOpen(true);
  }

  function resetFilters(): void {
    setFilter(EMPTY_TASK_FILTER);
  }

  async function handleMove(id: string, status: TaskStatus, version: number): Promise<void> {
    if (!spaceId) {
      return;
    }
    const error = await moveTask(spaceId, id, status, version);
    if (error && !GLOBAL_TOAST_CODES.has(error.code)) {
      pushToast(messageForCode(error.code, error.message), "error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Задачи</h1>
        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={view === "kanban" ? styles.toggleActive : ""}
              onClick={() => setView("kanban")}
            >
              Канбан
            </button>
            <button
              type="button"
              className={view === "list" ? styles.toggleActive : ""}
              onClick={() => setView("list")}
            >
              Список
            </button>
          </div>
          <button className="btn-primary" type="button" onClick={() => openModal("new")}>
            Новая задача
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          placeholder="Поиск по заголовку и описанию…"
          value={filter.search}
          onChange={(event) => setFilter({ ...filter, search: event.target.value })}
        />
        <select
          value={filter.priority ?? ""}
          onChange={(event) =>
            setFilter({
              ...filter,
              priority: event.target.value === "" ? null : (event.target.value as TaskPriority),
            })
          }
          aria-label="Приоритет"
        >
          <option value="">Все приоритеты</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <select
          value={filter.assigneeId ?? ""}
          onChange={(event) =>
            setFilter({
              ...filter,
              assigneeId: event.target.value === "" ? null : event.target.value,
            })
          }
          aria-label="Исполнитель"
        >
          <option value="">Все исполнители</option>
          {allUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </select>
        {filterActive ? (
          <button className="btn-ghost" type="button" onClick={resetFilters}>
            Сбросить фильтры
          </button>
        ) : null}
      </div>

      {loading ? <div className={styles.loading}>Загрузка задач…</div> : null}

      {!spaceId ? (
        <div className={styles.emptyState}>Загрузка пространства…</div>
      ) : !loading && tasks.length === 0 && !filterActive ? (
        <div className={styles.emptyState}>В этом пространстве пока нет задач.</div>
      ) : !loading && filteredTasks.length === 0 && filterActive ? (
        <div className={styles.emptyState}>Ничего не найдено</div>
      ) : view === "kanban" ? (
        <KanbanBoard
          tasks={filteredTasks}
          users={users}
          onMove={(id, status, version) => void handleMove(id, status, version)}
          onAdd={openModal}
          onSelect={(task) => setSelectedId(task.id)}
        />
      ) : (
        <TaskListView
          tasks={filteredTasks}
          users={users}
          onSelect={(task) => setSelectedId(task.id)}
        />
      )}

      {modalOpen && spaceId ? (
        <NewTaskModal
          spaceId={spaceId}
          initialStatus={modalStatus}
          onClose={() => setModalOpen(false)}
          onCreated={addTask}
        />
      ) : null}

      {selectedTask && spaceId ? (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          spaceId={spaceId}
          onClose={() => {
            setSelectedId(null);
            if (taskParam) {
              const next = new URLSearchParams(searchParams);
              next.delete("task");
              setSearchParams(next, { replace: true });
            }
            void fetchTasks(spaceId);
          }}
        />
      ) : null}
    </div>
  );
}
