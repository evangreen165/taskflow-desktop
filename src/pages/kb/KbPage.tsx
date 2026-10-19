import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import KbCard from "@/components/kb/KbCard";
import NewNoteModal from "@/components/kb/NewNoteModal";
import { usePermissions } from "@/hooks/usePermissions";
import { EMPTY_KB_FILTER, filterNoteItems, type KbFilter } from "@/lib/kbMeta";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNoteStore } from "@/stores/useNoteStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./KbPage.module.css";

export default function KbPage(): JSX.Element {
  const notes = useNoteStore((s) => s.notes);
  const categories = useNoteStore((s) => s.categories);
  const loading = useNoteStore((s) => s.loading);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const fetchCategories = useNoteStore((s) => s.fetchCategories);
  const addCategory = useNoteStore((s) => s.addCategory);
  const removeCategory = useNoteStore((s) => s.removeCategory);
  const users = useUserDirectory((s) => s.users);
  const ensureUsers = useUserDirectory((s) => s.ensure);
  const currentUserId = useAuthStore((s) => s.session?.user.id ?? null);
  const { can } = usePermissions();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<KbFilter>(EMPTY_KB_FILTER);
  const [modalOpen, setModalOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    void fetchNotes();
    void fetchCategories();
  }, [fetchNotes, fetchCategories]);

  useEffect(() => {
    const ids = Array.from(new Set(notes.map((note) => note.authorId)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [notes, ensureUsers]);

  const visible = useMemo(
    () => filterNoteItems(notes, filter, currentUserId),
    [notes, filter, currentUserId],
  );
  const filterActive =
    filter.category !== null || filter.status !== "all" || filter.search.trim() !== "";

  async function submitCategory(): Promise<void> {
    const name = newCategoryName.trim();
    setNewCategoryOpen(false);
    if (!name) {
      return;
    }
    const created = await addCategory(name);
    if (created) {
      setFilter((current) => ({ ...current, category: name }));
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarRow}>
          <div className={styles.sidebarTitle}>Категории</div>
          {can("article.create") ? (
            <button
              className={styles.sidebarPlus}
              type="button"
              title="Новая категория"
              onClick={() => {
                setNewCategoryName("");
                setNewCategoryOpen(true);
              }}
            >
              +
            </button>
          ) : null}
        </div>

        {newCategoryOpen ? (
          <div className={styles.newCategoryRow}>
            <input
              autoFocus
              type="text"
              placeholder="Название категории"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitCategory();
                } else if (event.key === "Escape") {
                  setNewCategoryOpen(false);
                }
              }}
            />
            <button type="button" onClick={() => void submitCategory()}>
              OK
            </button>
          </div>
        ) : null}

        <FilterButton
          label="Все статьи"
          active={filter.category === null}
          onClick={() => setFilter({ ...filter, category: null })}
        />
        {categories.map((cat) => (
          <div key={cat} className={styles.filterRow}>
            <FilterButton
              label={cat}
              active={filter.category === cat}
              onClick={() =>
                setFilter({ ...filter, category: filter.category === cat ? null : cat })
              }
            />
            {can("article.create") ? (
              <button
                className={styles.filterDelete}
                type="button"
                title={`Удалить категорию «${cat}»`}
                onClick={() => void removeCategory(cat)}
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}

        <div className={styles.sidebarTitle}>Статус</div>
        <FilterButton
          label="Все"
          active={filter.status === "all"}
          onClick={() => setFilter({ ...filter, status: "all" })}
        />
        <FilterButton
          label="Опубликованные"
          active={filter.status === "published"}
          onClick={() => setFilter({ ...filter, status: "published" })}
        />
        <FilterButton
          label="Мои черновики"
          active={filter.status === "mine"}
          onClick={() => setFilter({ ...filter, status: "mine" })}
        />
      </aside>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            placeholder="Поиск по статьям…"
            value={filter.search}
            onChange={(event) => setFilter({ ...filter, search: event.target.value })}
          />
          {filterActive ? (
            <button className="btn-ghost" type="button" onClick={() => setFilter(EMPTY_KB_FILTER)}>
              Сбросить
            </button>
          ) : null}
          <button className="btn-primary" type="button" onClick={() => setModalOpen(true)}>
            Новая статья
          </button>
        </div>

        {loading ? <div className={styles.loading}>Загрузка…</div> : null}

        {!loading && visible.length === 0 ? (
          <div className={styles.emptyState}>Ничего не найдено</div>
        ) : (
          <div className={styles.grid}>
            {visible.map((item) => (
              <KbCard
                key={item.id}
                item={item}
                author={users[item.authorId]}
                onOpen={() => navigate(`/app/kb/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <NewNoteModal
          categories={categories}
          onClose={() => setModalOpen(false)}
          onCreated={(note) => navigate(`/app/kb/${note.meta.id}`)}
        />
      ) : null}
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`${styles.filter} ${active ? styles.filterActive : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
