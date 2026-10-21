import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ru } from "date-fns/locale";

import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import { messageForCode } from "@/lib/errorMessages";
import { priorityColor } from "@/lib/taskMeta";
import { TasksService, type Task } from "@/services/tasks";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";

import styles from "./CalendarPage.module.css";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const UNSCHEDULED_DROP_ID = "unscheduled";
const MAX_CELL_TASKS = 3;

/** Prefers pointer-precise targets; falls back to rectangle intersection. */
const calendarCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

type CalendarView = "month" | "week";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dayKey(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

export default function CalendarPage(): JSX.Element {
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const pushToast = useToastStore((s) => s.push);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return { start, end: endOfWeek(cursor, { weekStartsOn: 1 }) };
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    return { start, end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await TasksService.list(spaceId, {
      startDate: format(range.start, "yyyy-MM-dd"),
      endDate: format(range.end, "yyyy-MM-dd"),
    });
    if (result.ok) {
      setTasks(result.value);
    }
    setLoading(false);
  }, [range, spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => eachDayOfInterval({ start: range.start, end: range.end }), [range]);
  const knownDayKeys = useMemo(() => new Set(days.map(dayKey)), [days]);
  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [days]);

  const unscheduled = useMemo(() => tasks.filter((task) => !task.dueDate), [tasks]);

  function moveTask(id: string, dueDate: string | null, version: number): void {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, dueDate } : task)));
    void (async () => {
      if (!spaceId) {
        return;
      }
      const result = await TasksService.update(spaceId, id, { dueDate }, version);
      if (!result.ok) {
        pushToast(messageForCode(result.error.code, result.error.message), "error");
        void load();
        return;
      }
      setTasks((prev) => prev.map((task) => (task.id === id ? result.value : task)));
    })();
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const task = tasks.find((item) => item.id === active.id);
    if (!task) {
      return;
    }
    let newDue: string | null;
    if (over.id === UNSCHEDULED_DROP_ID) {
      newDue = null;
    } else {
      const target = String(over.id);
      if (!knownDayKeys.has(target)) {
        return;
      }
      newDue = target;
    }
    const oldDue = task.dueDate ? task.dueDate.slice(0, 10) : null;
    if (newDue === oldDue) {
      return;
    }
    moveTask(task.id, newDue, task.version);
  }

  const selectedTask: Task | null =
    selectedTaskId !== null ? (tasks.find((task) => task.id === selectedTaskId) ?? null) : null;
  const unscheduledDrop = useDroppable({ id: UNSCHEDULED_DROP_ID });

  const title =
    view === "month"
      ? capitalize(format(cursor, "LLLL yyyy", { locale: ru }))
      : `${format(range.start, "d MMM", { locale: ru })} — ${format(range.end, "d MMM yyyy", { locale: ru })}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{title}</h1>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() =>
              setCursor((current) =>
                view === "month" ? subMonths(current, 1) : subWeeks(current, 1),
              )
            }
          >
            ‹
          </button>
          <button type="button" className={styles.navBtn} onClick={() => setCursor(new Date())}>
            Сегодня
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() =>
              setCursor((current) =>
                view === "month" ? addMonths(current, 1) : addWeeks(current, 1),
              )
            }
          >
            ›
          </button>
        </div>
        <div className={styles.toggle}>
          <button
            type="button"
            className={view === "month" ? styles.toggleActive : ""}
            onClick={() => setView("month")}
          >
            Месяц
          </button>
          <button
            type="button"
            className={view === "week" ? styles.toggleActive : ""}
            onClick={() => setView("week")}
          >
            Неделя
          </button>
        </div>
      </div>

      {loading ? <div className={styles.muted}>Загрузка…</div> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={calendarCollision}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.body}>
          <div className={styles.calendarWrap}>
            <div className={styles.weekRow}>
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className={styles.weekday}>
                  {weekday}
                </div>
              ))}
            </div>

            {view === "month"
              ? weeks.map((week, index) => (
                  <div key={index} className={styles.weekRow}>
                    {week.map((day) => (
                      <DayCell
                        key={dayKey(day)}
                        day={day}
                        inMonth={isSameMonth(day, cursor)}
                        tasks={tasksFor(tasks, day)}
                        onOpen={(task) => setSelectedTaskId(task.id)}
                      />
                    ))}
                  </div>
                ))
              : weeks[0]?.map((day) => (
                  <DayCell
                    key={dayKey(day)}
                    day={day}
                    inMonth
                    week
                    tasks={tasksFor(tasks, day)}
                    onOpen={(task) => setSelectedTaskId(task.id)}
                  />
                ))}
          </div>

          <aside
            ref={unscheduledDrop.setNodeRef}
            className={`${styles.unscheduled} ${unscheduledDrop.isOver ? styles.unscheduledOver : ""}`}
          >
            <h3>Задачи без срока</h3>
            <p className={styles.mutedHint}>Перетащите задачу сюда, чтобы снять срок.</p>
            {unscheduled.length === 0 ? (
              <p className={styles.muted}>Нет задач без срока.</p>
            ) : (
              unscheduled.map((task) => (
                <DraggableTask
                  key={task.id}
                  task={task}
                  onOpen={() => setSelectedTaskId(task.id)}
                />
              ))
            )}
          </aside>
        </div>
      </DndContext>

      {selectedTask && spaceId ? (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          spaceId={spaceId}
          onClose={() => {
            setSelectedTaskId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function tasksFor(tasks: Task[], day: Date): Task[] {
  const key = dayKey(day);
  return tasks.filter((task) => task.dueDate?.slice(0, 10) === key);
}

function DayCell({
  day,
  inMonth,
  week,
  tasks,
  onOpen,
}: {
  day: Date;
  inMonth: boolean;
  week?: boolean;
  tasks: Task[];
  onOpen: (task: Task) => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const visible = tasks.slice(0, MAX_CELL_TASKS);
  const extra = tasks.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      className={`${styles.day} ${inMonth ? "" : styles.dayOther} ${week ? styles.dayWeek : ""} ${
        isOver ? styles.dayOver : ""
      }`}
    >
      <span className={styles.dayNumber}>{format(day, "d")}</span>
      {visible.map((task) => (
        <DraggableTask key={task.id} task={task} onOpen={() => onOpen(task)} />
      ))}
      {extra > 0 ? <span className={styles.more}>+ ещё {extra}</span> : null}
    </div>
  );
}

function DraggableTask({ task, onOpen }: { task: Task; onOpen: () => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

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

  return (
    <div
      ref={setNodeRef}
      className={styles.dragTask}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!draggedRef.current) {
          onOpen();
        }
      }}
    >
      <span className={styles.taskChip} style={{ background: priorityColor(task.priority) }}>
        {task.title}
      </span>
    </div>
  );
}
