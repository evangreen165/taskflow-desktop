import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import Avatar from "@/components/Avatar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTaskEditor } from "@/hooks/useTaskEditor";
import { KANBAN_COLUMNS, PRIORITY_LABELS, formatDateTime } from "@/lib/taskMeta";
import type { Comment, Task, TaskPriority, TaskStatus } from "@/services/tasks";
import type { UserSummary } from "@/services/users";
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
  const allUsers = useUserDirectory((s) => s.all);
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

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleClose(): Promise<void> {
    await flush();
    onClose();
  }

  async function handleDone(): Promise<void> {
    await flush();
    setViewMode("read");
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

  function handleSendComment(): void {
    if (!commentText.trim()) {
      return;
    }
    addComment(commentText);
    setCommentText("");
  }

  return (
    <>
      <div className={styles.backdrop} onClick={() => void handleClose()} />
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

          <div className={styles.section}>
            <label>Исполнители</label>
            {allUsers.length === 0 ? (
              <div className={styles.muted}>Загрузка пользователей…</div>
            ) : (
              <div className={styles.assigneeList}>
                {allUsers.map((user) => (
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
                <span className={item.done ? styles.strike : undefined}>{item.text}</span>
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
            <div className={styles.commentBox}>
              <textarea
                rows={2}
                placeholder="Написать комментарий…"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
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
