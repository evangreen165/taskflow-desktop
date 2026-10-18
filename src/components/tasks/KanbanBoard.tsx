import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { KANBAN_COLUMNS, type KanbanColumn } from "@/lib/taskMeta";
import type { Task, TaskStatus } from "@/services/tasks";
import type { UserSummary } from "@/services/users";

import TaskCard from "./TaskCard";
import styles from "./KanbanBoard.module.css";

interface KanbanBoardProps {
  tasks: Task[];
  users: Record<string, UserSummary>;
  onMove: (id: string, status: TaskStatus, version: number) => void;
  onAdd: (status: TaskStatus) => void;
}

export default function KanbanBoard({
  tasks,
  users,
  onMove,
  onAdd,
}: KanbanBoardProps): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) {
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
      <div className={styles.board}>
        {KANBAN_COLUMNS.map((column) => (
          <Column
            key={column.status}
            column={column}
            tasks={tasks.filter((task) => task.status === column.status)}
            users={users}
            onAdd={onAdd}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  column,
  tasks,
  users,
  onAdd,
}: {
  column: KanbanColumn;
  tasks: Task[];
  users: Record<string, UserSummary>;
  onAdd: (status: TaskStatus) => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <section
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.over : ""}`}
      aria-label={column.label}
    >
      <header className={styles.head}>
        <span className={`${styles.dot} ${styles[column.status] ?? ""}`} />
        <span className={styles.label}>{column.label}</span>
        <span className={styles.count}>{tasks.length}</span>
        <button
          className={styles.plus}
          type="button"
          title={`Добавить в «${column.label}»`}
          onClick={() => onAdd(column.status)}
        >
          +
        </button>
      </header>

      <div className={styles.cards}>
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} users={users} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({
  task,
  users,
}: {
  task: Task;
  users: Record<string, UserSummary>;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.drag} {...attributes} {...listeners}>
      <TaskCard task={task} users={users} />
    </div>
  );
}
