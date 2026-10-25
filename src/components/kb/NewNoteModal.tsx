import { useEffect, useState } from "react";

import { NotesService, type Note } from "@/services/notes";

import styles from "./NewNoteModal.module.css";

interface NewNoteModalProps {
  spaceId: string;
  categories: string[];
  onClose: () => void;
  onCreated: (note: Note) => void;
}

export default function NewNoteModal({
  spaceId,
  categories,
  onClose,
  onCreated,
}: NewNoteModalProps): JSX.Element {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [allCategories, setAllCategories] = useState<string[]>(categories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the space's actual category list from the backend (categories.json),
  // not just the categories of the notes that happen to be loaded.
  useEffect(() => {
    let cancelled = false;
    void NotesService.listCategories(spaceId).then((result) => {
      if (!cancelled && result.ok) {
        setAllCategories(result.value);
        setCategory((current) => current || result.value[0] || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  async function addCategory(): Promise<void> {
    const name = window.prompt("Название новой категории")?.trim();
    if (!name) {
      return;
    }
    const result = await NotesService.createCategory(spaceId, name);
    if (result.ok) {
      setAllCategories(result.value);
      setCategory(name);
    }
  }

  async function submit(): Promise<void> {
    if (!title.trim() || !category.trim()) {
      setError("Укажите заголовок и категорию.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await NotesService.create(spaceId, {
      title: title.trim(),
      category: category.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onCreated(result.value);
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Новая статья"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Новая статья</h2>

        {error ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="nn-title">Заголовок</label>
          <input
            id="nn-title"
            type="text"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="nn-category">Категория</label>
          <div className={styles.categoryRow}>
            <select
              id="nn-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">— выберите категорию —</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost"
              title="Новая категория"
              onClick={() => void addCategory()}
            >
              +
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
