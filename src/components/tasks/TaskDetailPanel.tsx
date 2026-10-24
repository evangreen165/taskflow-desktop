import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

import Avatar from "@/components/Avatar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTaskEditor } from "@/hooks/useTaskEditor";
import { messageForCode } from "@/lib/errorMessages";
import { KANBAN_COLUMNS, PRIORITY_LABELS, formatDateTime } from "@/lib/taskMeta";
import { SpacesService, type SpaceMember } from "@/services/spaces";
import {
  TasksService,
  type ChecklistItem,
  type Comment,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/services/tasks";
import type { UserSummary } from "@/services/users";
import { useRecentStore } from "@/stores/useRecentStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./TaskDetailPanel.module.css";

interface TaskDetailPanelProps {
  task: Task;
  spaceId: string;
  onClose: () => void;
}

type PreviewMode = "edit" | "preview";
type ViewMode = "read" | "edit";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export default function TaskDetailPanel({
  task,
  spaceId,
  onClose,
}: TaskDetailPanelProps): JSX.Element {
  const directory = useUserDirectory((s) => s.users);
  const loadAll = useUserDirectory((s) => s.loadAll);
  const { can } = usePermissions();

  const {
    draft,
    saving,
    error,
    conflictTask,
    externalUpdate,
    setTitle,
    setDescription,
    setStatus,
    setPriority,
    setDueDate,
    setAssignees,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    addComment,
    flush,
    reloadCurrent,
    dismissConflict,
    adoptExternal,
  } = useTaskEditor(task, spaceId);

  // Text fields (title/description) require an explicit edit mode; the other
  // controls (status/priority/assignees/checklist/comments) stay available.
  const [viewMode, setViewMode] = useState<ViewMode>("read");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("edit");
  const [newItem, setNewItem] = useState("");
  const [commentText, setCommentText] = useState("");
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetSpaceId, setTargetSpaceId] = useState("");
  const [moving, setMoving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const spaces = useSpaceStore((s) => s.spaces);
  const pushToast = useToastStore((s) => s.push);
  const recordRecent = useRecentStore((s) => s.record);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Remember the last viewed tasks for the command palette's "Недавние".
  useEffect(() => {
    recordRecent({ kind: "task", id: task.id, title: task.title, spaceId });
  }, [recordRecent, task.id, task.title, spaceId]);

  // Assignees and @mentions are limited to the task's space members.
  useEffect(() => {
    let cancelled = false;
    if (!spaceId) {
      setSpaceMembers([]);
      return;
    }
    void SpacesService.getMembers(spaceId).then((result) => {
      if (!cancelled && result.ok) {
        setSpaceMembers(result.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) {
      return [];
    }
    const query = mentionQuery.toLowerCase();
    return spaceMembers
      .filter(
        (user) =>
          user.login.toLowerCase().includes(query) ||
          user.displayName.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [mentionOpen, mentionQuery, spaceMembers]);

  async function handleClose(): Promise<void> {
    await flush();
    onClose();
  }

  async function handleDone(): Promise<void> {
    await flush();
    setViewMode("read");
  }

  async function handleMove(): Promise<void> {
    if (!targetSpaceId) {
      return;
    }
    setMoving(true);
    const result = await TasksService.move(task.id, spaceId, targetSpaceId);
    setMoving(false);
    if (!result.ok) {
      pushToast(messageForCode(result.error.code, result.error.message), "error");
      return;
    }
    const target = spaces.find((space) => space.id === targetSpaceId);
    pushToast(`Задача перемещена в «${target?.name ?? "пространство"}»`, "success");
    setMoveOpen(false);
    onClose();
  }

  async function handleDelete(): Promise<void> {
    if (!spaceId) {
      return;
    }
    // Clear any pending debounced title/description save before removing the task.
    await flush();
    setDeleting(true);
    const result = await TasksService.delete(spaceId, task.id);
    setDeleting(false);
    if (!result.ok) {
      pushToast(messageForCode(result.error.code, result.error.message), "error");
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(false);
    pushToast("Задача удалена", "success");
    onClose();
  }

  function toggleAssignee(id: string): void {
    const current = draft.assignees;
    setAssignees(current.includes(id) ? current.filter((a) => a !== id) : [...current, id]);
  }

  function handleAddItem(): void {
    if (!newItem.trim()) {
      return;
    }
    addChecklistItem(newItem);
    setNewItem("");
  }

  function handleCommentChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const value = event.target.value;
    setCommentText(value);
    const cursor = event.target.selectionStart ?? value.length;
    const match = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(value.slice(0, cursor));
    if (match) {
      setMentionQuery(match[1] ?? "");
      setMentionStart(cursor - (match[1]?.length ?? 0) - 1);
      setMentionIndex(0);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }

  function insertMention(user: SpaceMember): void {
    const textarea = commentRef.current;
    const cursor = textarea?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, mentionStart);
    const after = commentText.slice(cursor);
    const next = `${before}@${user.login} ${after}`;
    setCommentText(next);
    setMentionOpen(false);
    const position = before.length + user.login.length + 2;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    });
  }

  function handleCommentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (!mentionOpen || mentionMatches.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionIndex((index) => (index + 1) % mentionMatches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const user = mentionMatches[mentionIndex];
      if (user) {
        insertMention(user);
      }
    } else if (event.key === "Escape") {
      setMentionOpen(false);
    }
  }

  function handleSendComment(): void {
    if (!commentText.trim()) {
      return;
    }
    addComment(commentText);
    setCommentText("");
    setMentionOpen(false);
  }

  return (
    <>
      {/* The dimmed backdrop never closes the panel by itself: only the explicit
          ✕ button does, so selecting text or moving the mouse to the right
          cannot accidentally dismiss it. */}
      <div className={styles.backdrop} />
      <aside className={styles.panel}>
        <header className={styles.head}>
          {viewMode === "edit" ? (
            <input
              className={styles.titleInput}
              value={draft.title}
              placeholder="Название задачи"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void flush()}
            />
          ) : (
            <div className={styles.titleText}>{draft.title || "Без названия"}</div>
          )}
          <div className={styles.headRight}>
            {saving ? <span className={styles.saving}>Сохранение…</span> : null}
            {can("task.delete") ? (
              <button
                className={styles.dangerBtn}
                type="button"
                title="Удалить задачу"
                onClick={() => setDeleteOpen(true)}
              >
                Удалить задачу
              </button>
            ) : null}
            {can("task.edit") ? (
              viewMode === "edit" ? (
                <button className="btn-ghost" type="button" onClick={() => void handleDone()}>
                  Готово
                </button>
              ) : (
                <button className="btn-ghost" type="button" onClick={() => setViewMode("edit")}>
                  Редактировать
                </button>
              )
            ) : null}
            <button
              className={styles.close}
              type="button"
              title="Закрыть"
              onClick={() => void handleClose()}
            >
              ✕
            </button>
          </div>
        </header>

        <div className={styles.body}>
          {error ? (
            <div className="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          ) : null}

          {externalUpdate ? (
            <div className={styles.externalBanner}>
              <span>
                Эта задача была обновлена другим пользователем. Ваши изменения не перезаписаны.
              </span>
              <button type="button" onClick={adoptExternal}>
                Показать актуальную версию
              </button>
            </div>
          ) : null}

          <div className={styles.fieldGrid}>
            <div className="field">
              <label htmlFor="td-status">Статус</label>
              <select
                id="td-status"
                value={draft.status}
                onChange={(event) => setStatus(event.target.value as TaskStatus)}
              >
                {KANBAN_COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="td-priority">Приоритет</label>
              <select
                id="td-priority"
                value={draft.priority}
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
              <label htmlFor="td-due">Срок</label>
              <input
                id="td-due"
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          {viewMode === "edit" && can("task.edit") ? (
            <div className={styles.section}>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setTargetSpaceId("");
                  setMoveOpen(true);
                }}
              >
                Переместить в пространство
              </button>
            </div>
          ) : null}

          <div className={styles.section}>
            <label>Исполнители</label>
            {spaceMembers.length === 0 ? (
              <div className={styles.muted}>В пространстве нет участников.</div>
            ) : (
              <div className={styles.assigneeList}>
                {spaceMembers.map((user) => (
                  <label key={user.id} className={styles.assigneeOption}>
                    <input
                      type="checkbox"
                      checked={draft.assignees.includes(user.id)}
                      onChange={() => toggleAssignee(user.id)}
                    />
                    <Avatar
                      name={user.displayName}
                      color={user.avatarColor}
                      sha256={user.avatarSha256}
                      size={24}
                    />
                    {user.displayName}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            {viewMode === "read" ? (
              <div className={styles.descriptionRead}>
                <ReactMarkdown>{draft.description || "*Нет описания.*"}</ReactMarkdown>
              </div>
            ) : (
              <>
                <div className={styles.tabs}>
                  <button
                    type="button"
                    className={previewMode === "edit" ? styles.tabActive : ""}
                    onClick={() => setPreviewMode("edit")}
                  >
                    Редактор
                  </button>
                  <button
                    type="button"
                    className={previewMode === "preview" ? styles.tabActive : ""}
                    onClick={() => setPreviewMode("preview")}
                  >
                    Предпросмотр
                  </button>
                </div>
                {previewMode === "edit" ? (
                  <textarea
                    className={styles.mdInput}
                    rows={8}
                    placeholder="Описание (Markdown)"
                    value={draft.description}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={() => void flush()}
                  />
                ) : (
                  <div className={styles.markdownPreview}>
                    <ReactMarkdown>{draft.description || "*Нет описания.*"}</ReactMarkdown>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.section}>
            <label>Чек-лист</label>
            {draft.checklist.map((item) => (
              <div key={item.id} className={styles.checklistRow}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleChecklistItem(item.id)}
                />
                <ChecklistItemInput item={item} onUpdate={updateChecklistItem} />
                <button
                  className={styles.iconBtn}
                  type="button"
                  title="Удалить пункт"
                  onClick={() => removeChecklistItem(item.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <input
              className={styles.addInput}
              type="text"
              placeholder="Добавить пункт (Enter)"
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleAddItem();
                }
              }}
            />
          </div>

          <div className={styles.section}>
            <label>Комментарии</label>
            {draft.comments.length === 0 ? (
              <div className={styles.muted}>Комментариев пока нет.</div>
            ) : (
              draft.comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} directory={directory} />
              ))
            )}
            <div className={styles.commentComposer}>
              {mentionOpen && mentionMatches.length > 0 ? (
                <div className={styles.mentionMenu} role="listbox" aria-label="Упомянуть участника">
                  {mentionMatches.map((user, index) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      aria-selected={index === mentionIndex}
                      className={`${styles.mentionItem} ${
                        index === mentionIndex ? styles.mentionActive : ""
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(user);
                      }}
                    >
                      <Avatar
                        name={user.displayName}
                        color={user.avatarColor}
                        sha256={user.avatarSha256}
                        size={20}
                      />
                      <span className={styles.mentionName}>{user.displayName}</span>
                      <span className={styles.mentionLogin}>@{user.login}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={styles.commentBox}>
                <textarea
                  ref={commentRef}
                  rows={2}
                  placeholder="Написать комментарий… (@ — упомянуть)"
                  value={commentText}
                  onChange={handleCommentChange}
                  onKeyDown={handleCommentKeyDown}
                />
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!commentText.trim()}
                  onClick={handleSendComment}
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>

        {moveOpen ? (
          <div className={styles.modalBackdrop}>
            <div className={styles.conflictCard}>
              <h3>Переместить задачу</h3>
              <p>Выберите пространство, в которое нужно переместить задачу.</p>
              <div className="field">
                <label htmlFor="move-space">Пространство</label>
                <select
                  id="move-space"
                  value={targetSpaceId}
                  onChange={(event) => setTargetSpaceId(event.target.value)}
                >
                  <option value="">— выберите пространство —</option>
                  {spaces
                    .filter((space) => space.id !== spaceId)
                    .map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.actions}>
                <button className="btn-ghost" type="button" onClick={() => setMoveOpen(false)}>
                  Отмена
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!targetSpaceId || moving}
                  onClick={() => void handleMove()}
                >
                  {moving ? "Перемещение…" : "Переместить"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteOpen ? (
          <div className={styles.modalBackdrop}>
            <div className={styles.conflictCard}>
              <h3>Удалить задачу</h3>
              <p>
                Задача «{draft.title || "Без названия"}» будет удалена без возможности
                восстановления.
              </p>
              <div className={styles.actions}>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                >
                  Отмена
                </button>
                <button
                  className={styles.dangerSolid}
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? "Удаление…" : "Удалить"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {conflictTask ? (
          <div className={styles.modalBackdrop}>
            <div className={styles.conflictCard}>
              <h3>Конфликт версий</h3>
              <p>
                Задача была изменена другим пользователем. Ваши последние изменения не сохранены.
              </p>
              <div className={styles.actions}>
                <button className="btn-primary" type="button" onClick={reloadCurrent}>
                  Загрузить актуальную версию
                </button>
                <button className="btn-ghost" type="button" onClick={dismissConflict}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function CommentRow({
  comment,
  directory,
}: {
  comment: Comment;
  directory: Record<string, UserSummary>;
}): JSX.Element {
  const author = directory[comment.authorId];
  return (
    <div className={styles.comment}>
      <Avatar
        name={author?.displayName ?? "?"}
        color={author?.avatarColor ?? "#5b5bd6"}
        sha256={author?.avatarSha256}
        size={26}
      />
      <div className={styles.commentBody}>
        <div className={styles.commentMeta}>
          <b>{author?.displayName ?? "Пользователь"}</b>
          <span>{formatDateTime(comment.createdAt)}</span>
        </div>
        <div className={styles.commentText}>{comment.text}</div>
      </div>
    </div>
  );
}

/**
 * Inline text editor for a checklist item: keeps a local draft while typing
 * and commits to the task (via `tasksUpdate`) on blur or Enter.
 */
function ChecklistItemInput({
  item,
  onUpdate,
}: {
  item: ChecklistItem;
  onUpdate: (id: string, text: string) => void;
}): JSX.Element {
  const [text, setText] = useState(item.text);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(item.text);
    }
  }, [item.text, focused]);

  function commit(): void {
    const trimmed = text.trim();
    if (trimmed && trimmed !== item.text) {
      onUpdate(item.id, trimmed);
    } else {
      setText(item.text);
    }
  }

  return (
    <input
      className={item.done ? `${styles.checklistInput} ${styles.strike}` : styles.checklistInput}
      type="text"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setText(item.text);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
