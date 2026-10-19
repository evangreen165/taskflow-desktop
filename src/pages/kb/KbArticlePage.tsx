import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useNoteEditor } from "@/hooks/useNoteEditor";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryIcon, formatDate, NOTE_STATUS_LABELS } from "@/lib/kbMeta";
import { NotesService, type Note, type NoteMeta } from "@/services/notes";
import { useNoteStore } from "@/stores/useNoteStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./KbArticlePage.module.css";

export default function KbArticlePage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const pushToast = useToastStore((s) => s.push);
  const users = useUserDirectory((s) => s.users);
  const ensureUsers = useUserDirectory((s) => s.ensure);

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<NoteMeta[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setMode("read");
    setNote(null);
    if (!id) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    void NotesService.get(id).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setNote(result.value);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (note) {
      void ensureUsers([note.meta.authorId]);
    }
  }, [note, ensureUsers]);

  if (loading) {
    return <div className={styles.page}>Загрузка статьи…</div>;
  }

  if (loadFailed || !note) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h1>Статья не найдена</h1>
          <button className="btn-primary" type="button" onClick={() => navigate("/app/kb")}>
            Назад в Базу знаний
          </button>
        </div>
      </div>
    );
  }

  const meta = note.meta;
  const author = users[meta.authorId];

  async function handlePublish(): Promise<void> {
    setBusy(true);
    const result = await NotesService.publish(meta.id, meta.version);
    setBusy(false);
    if (!result.ok) {
      return;
    }
    setNote(result.value);
    pushToast("Статья опубликована", "success");
  }

  async function handleDelete(): Promise<void> {
    setBusy(true);
    const result = await NotesService.delete(meta.id);
    setBusy(false);
    if (!result.ok) {
      return;
    }
    setConfirmDelete(false);
    pushToast("Статья удалена", "success");
    navigate("/app/kb");
  }

  async function openHistory(): Promise<void> {
    setHistoryOpen(true);
    setHistory(null);
    const result = await NotesService.getHistory(meta.id);
    if (result.ok) {
      setHistory(result.value);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={() => navigate("/app/kb")}>
          ← База знаний
        </button>
        <div className={styles.headerMeta}>
          <span className={styles.category}>
            {categoryIcon(meta.category)} {meta.category}
          </span>
          <span>Обновлено {formatDate(meta.updatedAt)}</span>
        </div>
        <div className={styles.headerActions}>
          {mode === "read" ? (
            <>
              {can("article.edit") ? (
                <button className="btn-ghost" type="button" onClick={() => setMode("edit")}>
                  Редактировать
                </button>
              ) : null}
              {meta.status === "draft" && can("article.publish") ? (
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePublish()}
                >
                  Опубликовать
                </button>
              ) : null}
              <button className="btn-ghost" type="button" onClick={() => void openHistory()}>
                История версий
              </button>
              {can("article.delete") ? (
                <button className="btn-ghost" type="button" onClick={() => setConfirmDelete(true)}>
                  Удалить
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {mode === "read" ? (
        <div className={styles.read}>
          <h1 className={styles.title}>{meta.title}</h1>
          {meta.tags.length > 0 ? (
            <div className={styles.tags}>
              {meta.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.byline}>
            <span>{author?.displayName ?? "—"}</span>
            {meta.status === "draft" ? (
              <span className={styles.draftBadge}>{NOTE_STATUS_LABELS.draft}</span>
            ) : null}
          </div>
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {note.content || "*Нет содержания.*"}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <ArticleEditor
          key={meta.id}
          initial={note}
          onSaved={setNote}
          onCancel={() => setMode("read")}
        />
      )}

      {historyOpen ? (
        <HistoryModal
          id={meta.id}
          history={history}
          onClose={() => setHistoryOpen(false)}
          onRestored={(updated) => {
            setNote(updated);
            setHistoryOpen(false);
            pushToast("Версия восстановлена", "success");
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.confirmCard}>
            <h3>Удалить статью?</h3>
            <p>«{meta.title}» будет удалена без возможности восстановления.</p>
            <div className={styles.actions}>
              <button className="btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArticleEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Note;
  onSaved: (note: Note) => void;
  onCancel: () => void;
}): JSX.Element {
  const {
    draft,
    saving,
    error,
    conflict,
    setTitle,
    setCategory,
    setTags,
    setContent,
    saveNow,
    reload,
    dismissConflict,
  } = useNoteEditor(initial, onSaved);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [tagInput, setTagInput] = useState("");
  // Select a stable reference and derive the list with useMemo: a selector that
  // returns a fresh array (e.g. `s.notes.map(...)`) breaks `useSyncExternalStore`
  // and causes an infinite render loop.
  const allNotes = useNoteStore((s) => s.notes);
  const categories = useMemo(
    () => Array.from(new Set(allNotes.map((note) => note.category).filter(Boolean))),
    [allNotes],
  );

  function addTag(): void {
    const value = tagInput.trim();
    if (!value || draft.tags.includes(value)) {
      return;
    }
    setTags([...draft.tags, value]);
    setTagInput("");
  }

  async function loadCurrent(): Promise<void> {
    const result = await NotesService.get(initial.meta.id);
    if (result.ok) {
      reload(result.value);
    }
  }

  return (
    <div className={styles.editor}>
      {error ? (
        <div className="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      <div className={styles.editRow}>
        <div className="field">
          <label htmlFor="ae-title">Заголовок</label>
          <input
            id="ae-title"
            type="text"
            value={draft.title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ae-category">Категория</label>
          <input
            id="ae-category"
            type="text"
            list="ae-categories"
            value={draft.category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="ae-categories">
            {Array.from(new Set(categories.filter(Boolean))).map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.section}>
        <label>Теги</label>
        <div className={styles.tags}>
          {draft.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button type="button" onClick={() => setTags(draft.tags.filter((t) => t !== tag))}>
                ✕
              </button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            type="text"
            placeholder="Добавить тег (Enter)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addTag();
              }
            }}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={mode === "edit" ? styles.tabActive : ""}
            onClick={() => setMode("edit")}
          >
            Редактор
          </button>
          <button
            type="button"
            className={mode === "preview" ? styles.tabActive : ""}
            onClick={() => setMode("preview")}
          >
            Предпросмотр
          </button>
        </div>
        {mode === "edit" ? (
          <textarea
            className={styles.mdInput}
            rows={18}
            value={draft.content}
            placeholder="Текст статьи (Markdown)"
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <div className={styles.mdPreview}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {draft.content || "*Нет содержания.*"}
            </ReactMarkdown>
          </div>
        )}
      </div>

      <div className={styles.editorFooter}>
        <span className={styles.muted}>
          {saving ? "Сохранение…" : "Изменения сохраняются автоматически"}
        </span>
        <div className={styles.actions}>
          <button className="btn-ghost" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={saving}
            onClick={() => void saveNow()}
          >
            Сохранить
          </button>
        </div>
      </div>

      {conflict ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.conflictCard}>
            <h3>Конфликт версий</h3>
            <p>Статья была изменена другим пользователем. Ваши последние изменения не сохранены.</p>
            <div className={styles.actions}>
              <button className="btn-primary" type="button" onClick={() => void loadCurrent()}>
                Загрузить актуальную версию
              </button>
              <button className="btn-ghost" type="button" onClick={dismissConflict}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HistoryModal({
  id,
  history,
  onClose,
  onRestored,
}: {
  id: string;
  history: NoteMeta[] | null;
  onClose: () => void;
  onRestored: (note: Note) => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const users = useUserDirectory((s) => s.users);

  async function restore(version: number): Promise<void> {
    setBusy(true);
    const result = await NotesService.restoreVersion(id, version);
    setBusy(false);
    if (result.ok) {
      onRestored(result.value);
    }
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.historyCard}>
        <div className={styles.historyHead}>
          <h3>История версий</h3>
          <button className={styles.close} type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        {history === null ? (
          <p className={styles.muted}>Загрузка…</p>
        ) : history.length === 0 ? (
          <p className={styles.muted}>История пуста.</p>
        ) : (
          <ul className={styles.historyList}>
            {history.map((item) => (
              <li key={item.version} className={styles.historyRow}>
                <div>
                  <b>Версия {item.version}</b>
                  <span className={styles.muted}>
                    {formatDate(item.updatedAt)} · {users[item.authorId]?.displayName ?? "—"}
                  </span>
                </div>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void restore(item.version)}
                >
                  Восстановить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
