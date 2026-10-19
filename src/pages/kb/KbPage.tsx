import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import KbCard from "@/components/kb/KbCard";
import NewNoteModal from "@/components/kb/NewNoteModal";
import { EMPTY_KB_FILTER, filterNoteItems, type KbFilter } from "@/lib/kbMeta";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNoteStore } from "@/stores/useNoteStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./KbPage.module.css";

export default function KbPage(): JSX.Element {
  const notes = useNoteStore((s) => s.notes);
  const loading = useNoteStore((s) => s.loading);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const users = useUserDirectory((s) => s.users);
  const ensureUsers = useUserDirectory((s) => s.ensure);
  const currentUserId = useAuthStore((s) => s.session?.user.id ?? null);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<KbFilter>(EMPTY_KB_FILTER);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    const ids = Array.from(new Set(notes.map((note) => note.authorId)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [notes, ensureUsers]);

  const categories = useMemo(() => {
    const set = new Set(notes.map((note) => note.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [notes]);

  const visible = useMemo(
    () => filterNoteItems(notes, filter, currentUserId),
    [notes, filter, currentUserId],
  );
  const filterActive =
    filter.category !== null || filter.status !== "all" || filter.search.trim() !== "";

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Категории</div>
        <FilterButton
          label="Все статьи"
          active={filter.category === null}
          onClick={() => setFilter({ ...filter, category: null })}
        />
        {categories.map((cat) => (
          <FilterButton
            key={cat}
            label={cat}
            active={filter.category === cat}
            onClick={() => setFilter({ ...filter, category: filter.category === cat ? null : cat })}
          />
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
