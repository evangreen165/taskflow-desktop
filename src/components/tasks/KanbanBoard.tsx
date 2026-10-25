import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";

import { KANBAN_COLUMNS, type KanbanColumn } from "@/lib/taskMeta";
import type { Task, TaskStatus } from "@/services/tasks";
import type { UserSummary } from "@/services/users";
import { WorkspaceService } from "@/services/workspace";
import { useSettingsStore } from "@/stores/useSettingsStore";

import TaskCard from "./TaskCard";
import styles from "./KanbanBoard.module.css";

interface KanbanBoardProps {
  tasks: Task[];
  users: Record<string, UserSummary>;
  onMove: (id: string, status: TaskStatus, version: number) => void;
  onAdd: (status: TaskStatus) => void;
  onSelect?: (task: Task) => void;
}

const DEFAULT_ORDER = KANBAN_COLUMNS.map((column) => column.status as string);

function normalizeOrder(order: string[]): string[] {
  const next = order.filter((status) => DEFAULT_ORDER.includes(status));
  for (const status of DEFAULT_ORDER) {
    if (!next.includes(status)) {
      next.push(status);
    }
  }
  return next;
}

export default function KanbanBoard({
  tasks,
  users,
  onMove,
  onAdd,
  onSelect,
}: KanbanBoardProps): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const hideEmptyColumns = useSettingsStore((s) => s.hideEmptyColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_ORDER);

  useEffect(() => {
    let cancelled = false;
    void WorkspaceService.getKanbanOrder().then((result) => {
      if (!cancelled && result.ok) {
        setColumnOrder(normalizeOrder(result.value));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedColumns = useMemo(() => {
    const byStatus = new Map(KANBAN_COLUMNS.map((column) => [column.status, column]));
    const ordered = normalizeOrder(columnOrder)
      .map((status) => byStatus.get(status as TaskStatus))
      .filter((column): column is KanbanColumn => Boolean(column));
    return hideEmptyColumns
      ? ordered.filter((column) => tasks.some((task) => task.status === column.status))
      : ordered;
  }, [columnOrder, hideEmptyColumns, tasks]);

  function reorderColumns(activeId: string, overId: string): void {
    setColumnOrder((current) => {
      const normalized = normalizeOrder(current);
      const from = normalized.indexOf(activeId);
      const to = normalized.indexOf(overId);
      if (from === -1 || to === -1 || from === to) {
        return current;
      }
      const next = [...normalized];
      const [moved] = next.splice(from, 1);
      if (!moved) {
        return current;
      }
      next.splice(to, 0, moved);
      void WorkspaceService.setKanbanOrder(next);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) {
      return;
    }
    if (active.data.current?.type === "column") {
      reorderColumns(String(active.id), String(over.id));
      return;
    }
    const task = tasks.find((item) => item.id === active.id);
    if (!task) {
      return;
    }
    const target = over.id as TaskStatus;
    if (!KANBAN_COLUMNS.some((column) => column.status === target) || task.status === target) {
      return;
    }
    onMove(task.id, target, task.version);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext
        items={orderedColumns.map((column) => column.status)}
        strategy={horizontalListSortingStrategy}
      >
        <div className={styles.board}>
          {orderedColumns.map((column) => (
            <Column
              key={column.status}
              column={column}
              tasks={tasks.filter((task) => task.status === column.status)}
              users={users}
              onAdd={onAdd}
              onSelect={onSelect}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Column({
  column,
  tasks,
  users,
  onAdd,
  onSelect,
}: {
  column: KanbanColumn;
  tasks: Task[];
  users: Record<string, UserSummary>;
  onAdd: (status: TaskStatus) => void;
  onSelect?: ((task: Task) => void) | undefined;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: column.status, data: { type: "column" } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`${styles.column} ${isOver ? styles.over : ""}`}
      aria-label={column.label}
    >
      <header className={styles.head} {...attributes} {...listeners} title="Перетащите, чтобы изменить порядок">
        <span className={`${styles.dot} ${styles[column.status] ?? ""}`} />
        <span className={styles.label}>{column.label}</span>
        <span className={styles.count}>{tasks.length}</span>
        {column.status !== "trash" ? (
          <button
            className={styles.plus}
            type="button"
            title={`Добавить в «${column.label}»`}
            onClick={() => onAdd(column.status)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            +
          </button>
        ) : null}
      </header>

      <div className={styles.cards}>
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} users={users} onSelect={onSelect} />
        ))}
        {tasks.length === 0 ? <div className={styles.empty}>Нет задач</div> : null}
      </div>
    </section>
  );
}

function DraggableCard({
  task,
  users,
  onSelect,
}: {
  task: Task;
  users: Record<string, UserSummary>;
  onSelect?: ((task: Task) => void) | undefined;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: "task" },
  });

  // A drag must not be mistaken for a click on the card.
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      draggedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      draggedRef.current = false;
    }, 150);
    return () => clearTimeout(timer);
  }, [isDragging]);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.drag}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!draggedRef.current) {
          onSelect?.(task);
        }
      }}
    >
      <TaskCard task={task} users={users} />
    </div>
  );
}
