import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { AttachmentImage, AttachmentLink } from "@/components/kb/MarkdownAttachments";
import MarkdownToolbar from "@/components/kb/MarkdownToolbar";
import { useIsPersonalSpaceOwner } from "@/hooks/useIsPersonalSpaceOwner";
import { useNoteEditor } from "@/hooks/useNoteEditor";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryIcon, formatDate, NOTE_STATUS_LABELS } from "@/lib/kbMeta";
import { AttachmentsService } from "@/services/attachments";
import { NotesService, type Note, type NoteMeta } from "@/services/notes";
import { useNoteStore } from "@/stores/useNoteStore";
import { useRecentStore } from "@/stores/useRecentStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./KbArticlePage.module.css";

export default function KbArticlePage(): JSX.Element {
  const { id } = useParams();
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const navigate = useNavigate();
  const { can } = usePermissions();
  const personalOwner = useIsPersonalSpaceOwner();
  const canEditArticle = can("article.edit") || personalOwner;
  const canPublishArticle = can("article.publish") || personalOwner;
  const canDeleteArticle = can("article.delete") || personalOwner;
  const fetchCategories = useNoteStore((s) => s.fetchCategories);
  const recordRecent = useRecentStore((s) => s.record);
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const spaces = useSpaceStore((s) => s.spaces);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setMode("read");
    setNote(null);
    if (!id || !spaceId) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    void NotesService.get(spaceId, id).then((result) => {
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
  }, [id, spaceId]);

  useEffect(() => {
    if (spaceId) {
      void fetchCategories(spaceId);
    }
  }, [spaceId, fetchCategories]);

  // Remember the last viewed notes for the command palette's "Недавние".
  useEffect(() => {
    if (note && spaceId) {
      recordRecent({ kind: "note", id: note.meta.id, title: note.meta.title, spaceId });
    }
  }, [note, recordRecent, spaceId]);

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
            Назад в Заметки
          </button>
        </div>
      </div>
    );
  }

  const meta = note.meta;
  const author = users[meta.authorId];

  async function handlePublish(): Promise<void> {
    setBusy(true);
    if (!spaceId) {
      return;
    }
    const result = await NotesService.publish(spaceId, meta.id, meta.version);
    setBusy(false);
    if (!result.ok) {
      return;
    }
    setNote(result.value);
    pushToast("Статья опубликована", "success");
  }

  async function handleDelete(): Promise<void> {
    setBusy(true);
    if (!spaceId) {
      return;
    }
    const result = await NotesService.delete(spaceId, meta.id);
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
    if (!spaceId) {
      return;
    }
    const result = await NotesService.getHistory(spaceId, meta.id);
    if (result.ok) {
      setHistory(result.value);
    }
  }

  function openShare(): void {
    setShareTargets(note?.meta.sharedWithSpaces ?? []);
    setShareOpen(true);
  }

  function toggleShareTarget(id: string): void {
    setShareTargets((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function submitShare(): Promise<void> {
    if (!spaceId || !note) {
      return;
    }
    setSharing(true);
    const result = await NotesService.share(note.meta.id, spaceId, shareTargets);
    setSharing(false);
    if (!result.ok) {
      return;
    }
    setNote(result.value);
    setShareOpen(false);
    pushToast("Доступ к заметке обновлён", "success");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={() => navigate("/app/kb")}>
          ← Заметки
        </button>
        <div className={styles.headerMeta}>
          <span className={styles.category}>
            {categoryIcon(meta.category)} {meta.category}
          </span>
          <span>Обновлено {formatDate(meta.updatedAt)}</span>
        </div>
        <div className={styles.headerActions}>
          {note.shared ? (
            <span className={styles.sharedBadge} title="Заметка из другого пространства">
              📤 Общая заметка
            </span>
          ) : null}
          {mode === "read" ? (
            <>
              {!note.shared && canEditArticle ? (
                <button className="btn-ghost" type="button" onClick={() => setMode("edit")}>
                  Редактировать
                </button>
              ) : null}
              {!note.shared && meta.status === "draft" && canPublishArticle ? (
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePublish()}
                >
                  Опубликовать
                </button>
              ) : null}
              {!note.shared && canEditArticle ? (
                <button className="btn-ghost" type="button" onClick={openShare}>
                  Поделиться
                </button>
              ) : null}
              <button className="btn-ghost" type="button" onClick={() => void openHistory()}>
                История версий
              </button>
              {!note.shared && canDeleteArticle ? (
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
          <h1 className={styles.title}>
            {meta.title}
            {meta.category ? (
              <span className={styles.categoryBadge}>Категория: {meta.category}</span>
            ) : null}
          </h1>
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              urlTransform={(url) => url}
              components={{ img: AttachmentImage, a: AttachmentLink }}
            >
              {note.content || "*Нет содержания.*"}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <ArticleEditor
          key={meta.id}
          initial={note}
          spaceId={spaceId ?? ""}
          onSaved={setNote}
          onCancel={() => setMode("read")}
        />
      )}

      {shareOpen ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.historyCard}>
            <div className={styles.historyHead}>
              <h3>Поделиться заметкой</h3>
              <button className={styles.close} type="button" onClick={() => setShareOpen(false)}>
                ✕
              </button>
            </div>
            <p className={styles.muted}>
              Выберите пространства, которым будет доступна эта заметка.
            </p>
            <div className={styles.shareList}>
              {spaces.filter((space) => space.id !== spaceId).length === 0 ? (
                <p className={styles.muted}>Других пространств нет.</p>
              ) : (
                spaces
                  .filter((space) => space.id !== spaceId)
                  .map((space) => (
                    <label key={space.id} className={styles.shareOption}>
                      <input
                        type="checkbox"
                        checked={shareTargets.includes(space.id)}
                        onChange={() => toggleShareTarget(space.id)}
                      />
                      {space.name}
                    </label>
                  ))
              )}
            </div>
            <div className={styles.actions}>
              <button className="btn-ghost" type="button" onClick={() => setShareOpen(false)}>
                Отмена
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={sharing}
                onClick={() => void submitShare()}
              >
                {sharing ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <HistoryModal
          id={meta.id}
          spaceId={spaceId ?? ""}
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

/** Builds the Markdown/HTML for an image with the chosen width and alignment. */
function buildImageMarkup(
  sha: string,
  width: string,
  align: "left" | "center" | "right",
): string {
  if (align === "center") {
    return `<div align="center"><img src="attachment://${sha}" width="${width}" /></div>`;
  }
  const float = align === "left" ? "left" : "right";
  return `<div><img src="attachment://${sha}" width="${width}" style="float: ${float};" /></div>`;
}

/** Replaces an existing wrapped image, a bare `<img>`, or the Markdown image. */
function resizeImageInMarkdown(
  content: string,
  sha: string,
  width: string,
  align: "left" | "center" | "right",
): string {
  const replacement = buildImageMarkup(sha, width, align);
  const wrapped = new RegExp(
    `<div[^>]*>\\s*<img[^>]*src="attachment://${sha}"[^>]*>\\s*</div>`,
    "i",
  );
  const imgTag = new RegExp(`<img[^>]*src="attachment://${sha}"[^>]*>`);
  const mdImg = new RegExp(`!\\[[^\\]]*\\]\\(attachment://${sha}\\)`);
  if (wrapped.test(content)) {
    return content.replace(wrapped, replacement);
  }
  if (imgTag.test(content)) {
    return content.replace(imgTag, replacement);
  }
  if (mdImg.test(content)) {
    return content.replace(mdImg, replacement);
  }
  return content;
}

function ArticleEditor({
  initial,
  spaceId,
  onSaved,
  onCancel,
}: {
  initial: Note;
  spaceId: string;
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
  } = useNoteEditor(initial, spaceId, onSaved);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [tagInput, setTagInput] = useState("");
  const [resizeTarget, setResizeTarget] = useState<{
    sha: string;
    alt: string;
    rect: DOMRect;
    align: "left" | "center" | "right";
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Preserves the caret and scroll position across controlled-textarea
  // re-renders so typing does not jump the editor to the bottom.
  const caretRef = useRef<{ start: number; end: number; scrollTop: number } | null>(null);
  // Explicit category list from the backend (`categories.json`).
  const categories = useNoteStore((s) => s.categories);

  function addTag(): void {
    const value = tagInput.trim();
    if (!value || draft.tags.includes(value)) {
      return;
    }
    setTags([...draft.tags, value]);
    setTagInput("");
  }

  function insertMarkdown(markdown: string): void {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? draft.content.length;
    const end = element?.selectionEnd ?? start;
    const scrollTop = element?.scrollTop ?? 0;
    const next = draft.content.slice(0, start) + markdown + draft.content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      element?.focus();
      const position = start + markdown.length;
      element?.setSelectionRange(position, position);
      if (element) {
        element.scrollTop = scrollTop;
      }
    });
  }

  /** Controlled-textarea change that restores caret/scroll after re-render. */
  function handleContentChange(next: string): void {
    const element = textareaRef.current;
    if (element) {
      caretRef.current = {
        start: element.selectionStart,
        end: element.selectionEnd,
        scrollTop: element.scrollTop,
      };
    }
    setContent(next);
  }

  useLayoutEffect(() => {
    const element = textareaRef.current;
    const saved = caretRef.current;
    if (element && saved) {
      element.focus();
      element.setSelectionRange(saved.start, saved.end);
      element.scrollTop = saved.scrollTop;
      caretRef.current = null;
    }
  }, [draft.content]);

  async function handleAddCategory(): Promise<void> {
    const name = window.prompt("Название новой категории")?.trim();
    if (!name) {
      return;
    }
    const ok = await useNoteStore.getState().addCategory(spaceId, name);
    if (ok) {
      setCategory(name);
    }
  }

  /**
   * Opens the native file picker (any file type), stores the file, and inserts
   * an image (`![name]`) or a clickable link (`[name]`) depending on the
   * detected MIME type.
   */
  async function attachFile(): Promise<void> {
    const selected = await open({ multiple: false });
    if (typeof selected !== "string") {
      return;
    }
    const name = selected.split(/[\\/]/).pop() ?? selected;
    const result = await AttachmentsService.add(selected, name);
    if (!result.ok) {
      return;
    }
    const { sha256, mime } = result.value.info;
    insertMarkdown(
      mime.startsWith("image/")
        ? `![${name}](attachment://${sha256})`
        : `[${name}](attachment://${sha256})`,
    );
  }

  async function loadCurrent(): Promise<void> {
    const result = await NotesService.get(spaceId, initial.meta.id);
    if (result.ok) {
      reload(result.value);
    }
  }

  function applyImageFormat(width: string, align: "left" | "center" | "right"): void {
    if (!resizeTarget) {
      return;
    }
    setContent(resizeImageInMarkdown(draft.content, resizeTarget.sha, width, align));
    setResizeTarget(null);
  }

  // Position the floating toolbar directly above the clicked image, relative
  // to the scrollable preview wrapper.
  const toolbarPosition = useMemo(() => {
    if (!resizeTarget) {
      return undefined;
    }
    const wrapper = previewRef.current;
    if (!wrapper) {
      return undefined;
    }
    const wrect = wrapper.getBoundingClientRect();
    return {
      top: Math.max(4, resizeTarget.rect.top - wrect.top - 44),
      left: Math.max(4, resizeTarget.rect.left - wrect.left),
    };
  }, [resizeTarget]);

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
          <div className={styles.categoryRow}>
            <select
              id="ae-category"
              value={draft.category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">— выберите категорию —</option>
              {Array.from(new Set(categories.filter(Boolean))).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              {draft.category && !categories.includes(draft.category) ? (
                <option value={draft.category}>{draft.category}</option>
              ) : null}
            </select>
            <button
              type="button"
              className="btn-ghost"
              title="Новая категория"
              onClick={() => void handleAddCategory()}
            >
              +
            </button>
          </div>
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
          <>
            <div className={styles.attachBar}>
              <button type="button" onClick={() => void attachFile()} title="Прикрепить любой файл">
                📎 Прикрепить файл
              </button>
            </div>
            <MarkdownToolbar
              textareaRef={textareaRef}
              value={draft.content}
              onChange={handleContentChange}
            />
            <textarea
              ref={textareaRef}
              className={styles.mdInput}
              rows={16}
              value={draft.content}
              placeholder="Текст статьи (Markdown)"
              onChange={(e) => handleContentChange(e.target.value)}
            />
          </>
        ) : (
          <>
            <div className={styles.mdPreview} ref={previewRef}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                urlTransform={(url) => url}
                components={{
                  img: (props) => (
                    <AttachmentImage
                      {...props}
                      onImageClick={(sha, alt, rect) =>
                        setResizeTarget({ sha, alt, rect, align: "center" })
                      }
                    />
                  ),
                  a: AttachmentLink,
                }}
              >
                {draft.content || "*Нет содержания.*"}
              </ReactMarkdown>
            </div>
            {resizeTarget && toolbarPosition ? (
              <div
                className={styles.imageToolbarFloat}
                style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
              >
                <span>Размер:</span>
                <button type="button" onClick={() => applyImageFormat("300", resizeTarget.align)}>
                  S
                </button>
                <button type="button" onClick={() => applyImageFormat("500", resizeTarget.align)}>
                  M
                </button>
                <button type="button" onClick={() => applyImageFormat("100%", resizeTarget.align)}>
                  L
                </button>
                <span className={styles.imageToolbarSep} />
                <button type="button" onClick={() => applyImageFormat("500", "left")}>
                  Слева
                </button>
                <button type="button" onClick={() => applyImageFormat("500", "center")}>
                  Центр
                </button>
                <button type="button" onClick={() => applyImageFormat("500", "right")}>
                  Справа
                </button>
                <button
                  type="button"
                  className={styles.imageToolbarClose}
                  onClick={() => setResizeTarget(null)}
                >
                  ✕
                </button>
              </div>
            ) : null}
          </>
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
  spaceId,
  history,
  onClose,
  onRestored,
}: {
  id: string;
  spaceId: string;
  history: NoteMeta[] | null;
  onClose: () => void;
  onRestored: (note: Note) => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const users = useUserDirectory((s) => s.users);

  async function restore(version: number): Promise<void> {
    setBusy(true);
    const result = await NotesService.restoreVersion(spaceId, id, version);
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
