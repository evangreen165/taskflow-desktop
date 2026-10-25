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
import { useNavigate } from "react-router-dom";

import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import { messageForCode } from "@/lib/errorMessages";
import { priorityColor } from "@/lib/taskMeta";
import { NotesService, type NoteListItem } from "@/services/notes";
import { TasksService, type Task } from "@/services/tasks";
import { WorkspaceService } from "@/services/workspace";
import { usePluginStore } from "@/stores/usePluginStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";

import styles from "./CalendarPage.module.css";

const OBSIDIAN_PLUGIN_ID = "obsidian-graph";

/** Maps the user-facing `YYYY/YY/DD/D` tokens to date-fns tokens. */
function toDateFnsFormat(format: string): string {
  return format
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
    .replace(/DD/g, "dd")
    .replace(/D/g, "d");
}

function formatDailyTitle(day: Date, fmt: string): string {
  return format(day, toDateFnsFormat(fmt), { locale: ru });
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const UNSCHEDULED_DROP_ID = "unscheduled";
const MAX_CELL_TASKS = 3;

function pointInRect(
  point: { x: number; y: number },
  rect: { top: number; left: number; width: number; height: number },
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/**
 * Prefers the "Без срока" sidebar while the pointer is over it, then falls back
 * to pointer-precise hits and finally rectangle intersection.
 *
 * The calendar grid scrolls horizontally, so on narrower windows its day cells
 * extend geometrically under the sidebar and can win `pointerWithin` even though
 * they are visually clipped. Prioritising the sidebar is what makes dragging a
 * scheduled task out of a day cell work.
 */
const calendarCollision: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  const sidebarRect = args.droppableRects.get(UNSCHEDULED_DROP_ID);
  if (pointer && sidebarRect && pointInRect(pointer, sidebarRect)) {
    return pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.id === UNSCHEDULED_DROP_ID,
      ),
    });
  }
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
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dailyFormat, setDailyFormat] = useState("YYYY-MM-DD");
  const extensionsEnabled = usePluginStore((s) => s.extensionsEnabled);
  const pluginStates = usePluginStore((s) => s.pluginStates);
  const obsidianEnabled = extensionsEnabled && pluginStates[OBSIDIAN_PLUGIN_ID] === true;
  const [notes, setNotes] = useState<NoteListItem[]>([]);

  useEffect(() => {
    void WorkspaceService.getDailyNoteFormat().then((result) => {
      if (result.ok) {
        setDailyFormat(result.value);
      }
    });
  }, []);

  useEffect(() => {
    if (!obsidianEnabled || !spaceId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void NotesService.list(spaceId, {}).then((result) => {
      if (!cancelled && result.ok) {
        setNotes(result.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [obsidianEnabled, spaceId]);

  /** Notes created on a given day (plus the daily note matching the format). */
  function notesForDate(day: Date): NoteListItem[] {
    if (!obsidianEnabled) {
      return [];
    }
    const key = format(day, "yyyy-MM-dd");
    const dailyTitle = formatDailyTitle(day, dailyFormat).toLowerCase();
    return notes.filter(
      (note) =>
        note.createdAt.slice(0, 10) === key || note.title.trim().toLowerCase() === dailyTitle,
    );
  }

  async function openDailyNote(): Promise<void> {
    if (!selectedDay || !spaceId) {
      return;
    }
    const title = formatDailyTitle(new Date(`${selectedDay}T00:00:00`), dailyFormat);
    const resolved = await NotesService.resolveTitle(spaceId, title);
    if (resolved.ok && resolved.value) {
      navigate(`/app/kb/${resolved.value}`);
      return;
    }
    await NotesService.createCategory(spaceId, "Дневник");
    const created = await NotesService.create(spaceId, { title, category: "Дневник" });
    if (created.ok) {
      navigate(`/app/kb/${created.value.meta.id}`);
    } else {
      pushToast(created.error.message, "error");
    }
  }

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
    const [scheduled, unscheduled] = await Promise.all([
      TasksService.list(spaceId, {
        startDate: format(range.start, "yyyy-MM-dd"),
        endDate: format(range.end, "yyyy-MM-dd"),
      }),
      // Tasks without a due date never match a date range; fetch them
      // separately so the "Без срока" sidebar is populated.
      TasksService.list(spaceId, { hasDueDate: false }),
    ]);
    if (scheduled.ok && unscheduled.ok) {
      const byId = new Map<string, Task>();
      for (const task of [...scheduled.value, ...unscheduled.value]) {
        byId.set(task.id, task);
      }
      setTasks([...byId.values()]);
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
    if (import.meta.env.DEV) {
      console.debug("[calendar] drag end", {
        activeId: active.id,
        overId: over?.id ?? null,
      });
    }
    if (!over) {
      return;
    }
    // Day-panel chips use a `panel:` prefix so they don't collide with the
    // same task rendered in the calendar grid (dnd-kit requires unique ids).
    const activeId = String(active.id).replace(/^panel:/, "");
    const task = tasks.find((item) => item.id === activeId);
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
  const dayTasks = selectedDay
    ? tasksFor(tasks, new Date(`${selectedDay}T00:00:00`))
    : [];
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
                        hasNote={notesForDate(day).length > 0}
                        onOpen={(task) => setSelectedTaskId(task.id)}
                        onSelectDay={() => setSelectedDay(dayKey(day))}
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
                    hasNote={notesForDate(day).length > 0}
                    onOpen={(task) => setSelectedTaskId(task.id)}
                    onSelectDay={() => setSelectedDay(dayKey(day))}
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

          {selectedDay ? (
            <aside className={styles.dayPanel} aria-label="Задачи на день">
              <div className={styles.dayPanelHead}>
                <h3>
                  {capitalize(
                    format(new Date(`${selectedDay}T00:00:00`), "d MMMM yyyy", { locale: ru }),
                  )}
                </h3>
                <button
                  type="button"
                  className={styles.dayPanelClose}
                  title="Закрыть"
                  onClick={() => setSelectedDay(null)}
                >
                  ✕
                </button>
              </div>
              {obsidianEnabled ? (
                <>
                  <button
                    type="button"
                    className={styles.dailyNoteBtn}
                    onClick={() => void openDailyNote()}
                  >
                    📓 Дневник на этот день
                  </button>
                  <div className={styles.dayNotes}>
                    <h4>Заметки этого дня</h4>
                    {selectedDay && notesForDate(new Date(`${selectedDay}T00:00:00`)).length === 0 ? (
                      <p className={styles.muted}>Нет заметок.</p>
                    ) : (
                      selectedDay &&
                      notesForDate(new Date(`${selectedDay}T00:00:00`)).map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className={styles.dayNoteLink}
                          onClick={() => navigate(`/app/kb/${note.id}`)}
                        >
                          📝 {note.title}
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : null}
              <p className={styles.mutedHint}>
                Перетащите задачу на день календаря или в «Без срока».
              </p>
              {dayTasks.length === 0 ? (
                <p className={styles.muted}>Нет задач на этот день.</p>
              ) : (
                dayTasks.map((task) => (
                  <DraggableTask
                    key={task.id}
                    task={task}
                    dragId={`panel:${task.id}`}
                    onOpen={() => setSelectedTaskId(task.id)}
                  />
                ))
              )}
            </aside>
          ) : null}
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
  hasNote,
  onOpen,
  onSelectDay,
}: {
  day: Date;
  inMonth: boolean;
  week?: boolean;
  tasks: Task[];
  hasNote?: boolean;
  onOpen: (task: Task) => void;
  onSelectDay: () => void;
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
      onClick={onSelectDay}
      title="Открыть задачи дня"
    >
      <span className={styles.dayNumber}>{format(day, "d")}</span>
      {hasNote ? (
        <span className={styles.noteDot} title="Есть заметка на этот день">
          📝
        </span>
      ) : null}
      {visible.map((task) => (
        <DraggableTask key={task.id} task={task} onOpen={() => onOpen(task)} />
      ))}
      {extra > 0 ? <span className={styles.more}>+ ещё {extra}</span> : null}
    </div>
  );
}

function DraggableTask({
  task,
  onOpen,
  dragId,
}: {
  task: Task;
  onOpen: () => void;
  dragId?: string;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId ?? task.id,
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
      onClick={(event) => {
        if (!draggedRef.current) {
          event.stopPropagation();
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
