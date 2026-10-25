import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";

import KbCard from "@/components/kb/KbCard";
import NewNoteModal from "@/components/kb/NewNoteModal";
import Skeleton from "@/components/ui/Skeleton";
import { useIsPersonalSpaceOwner } from "@/hooks/useIsPersonalSpaceOwner";
import { usePermissions } from "@/hooks/usePermissions";
import { EMPTY_KB_FILTER, filterNoteItems, type KbFilter } from "@/lib/kbMeta";
import { NotesService } from "@/services/notes";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNoteStore } from "@/stores/useNoteStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";
import { useUserDirectory } from "@/stores/useUserDirectory";

import styles from "./KbPage.module.css";

export default function KbPage(): JSX.Element {
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
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
  const personalOwner = useIsPersonalSpaceOwner();
  const canWriteNotes = can("article.create") || personalOwner;
  const pushToast = useToastStore((s) => s.push);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<KbFilter>(EMPTY_KB_FILTER);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    if (spaceId) {
      void fetchNotes(spaceId);
      void fetchCategories(spaceId);
    }
  }, [fetchNotes, fetchCategories, spaceId]);

  useEffect(() => {
    const ids = Array.from(new Set(notes.map((note) => note.authorId)));
    if (ids.length > 0) {
      void ensureUsers(ids);
    }
  }, [notes, ensureUsers]);

  const visible = useMemo(() => {
    const base = filterNoteItems(notes, filter, currentUserId);
    if (!tagFilter) {
      return base;
    }
    return base.filter((note) =>
      note.tags.some((tag) => tag === tagFilter || tag.startsWith(`${tagFilter}/`)),
    );
  }, [notes, filter, currentUserId, tagFilter]);

  // Hierarchical tag tree: `работа/проект` groups under `работа`.
  const tagTree = useMemo(() => {
    const all = new Set<string>();
    for (const note of notes) {
      for (const raw of note.tags) {
        const tag = raw.trim();
        if (tag) {
          all.add(tag);
        }
      }
    }
    const roots = new Map<string, string[]>();
    for (const tag of all) {
      const root = tag.split("/")[0] || tag;
      const children = roots.get(root) ?? [];
      if (tag !== root) {
        children.push(tag);
      }
      roots.set(root, children);
    }
    return [...roots.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const filterActive =
    filter.category !== null ||
    filter.status !== "all" ||
    filter.search.trim() !== "" ||
    tagFilter !== null;

  async function submitCategory(): Promise<void> {
    const name = newCategoryName.trim();
    setNewCategoryOpen(false);
    if (!name || !spaceId) {
      return;
    }
    const created = await addCategory(spaceId, name);
    if (created) {
      setFilter((current) => ({ ...current, category: name }));
    }
  }

  async function handleImport(): Promise<void> {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Документы", extensions: ["md", "markdown", "pdf"] }],
    });
    if (typeof selected !== "string") {
      return;
    }
    if (!spaceId) {
      return;
    }
    const result = await NotesService.importFile(spaceId, selected);
    if (!result.ok) {
      return;
    }
    pushToast(`Заметка «${result.value.meta.title}» импортирована`, "success");
    if (spaceId) {
      void fetchNotes(spaceId);
      void fetchCategories(spaceId);
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarRow}>
          <div className={styles.sidebarTitle}>Категории</div>
          {canWriteNotes ? (
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
            {canWriteNotes ? (
              <button
                className={styles.filterDelete}
                type="button"
                title={`Удалить категорию «${cat}»`}
                onClick={() => spaceId && void removeCategory(spaceId, cat)}
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}

        {tagTree.length > 0 ? (
          <>
            <div className={styles.sidebarTitle}>Теги</div>
            {tagTree.map(([root, children]) => (
              <div key={root} className={styles.tagGroup}>
                <FilterButton
                  label={`#${root}`}
                  active={tagFilter === root}
                  onClick={() => setTagFilter(tagFilter === root ? null : root)}
                />
                {children.map((tag) => (
                  <div key={tag} className={styles.tagChild}>
                    <FilterButton
                      label={`#${tag}`}
                      active={tagFilter === tag}
                      onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : null}

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
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setFilter(EMPTY_KB_FILTER);
                setTagFilter(null);
              }}
            >
              Сбросить
            </button>
          ) : null}
          {canWriteNotes ? (
            <button className="btn-ghost" type="button" onClick={() => void handleImport()}>
              Импорт
            </button>
          ) : null}
          {canWriteNotes ? (
            <button className="btn-primary" type="button" onClick={() => setModalOpen(true)}>
              Новая статья
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.skeletonCard}>
                <Skeleton height={14} width="70%" />
                <Skeleton height={10} width="45%" />
                <Skeleton height={10} width="90%" />
                <Skeleton height={10} width="60%" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.emptyState}>
            {notes.length === 0 && !filterActive
              ? "В этом пространстве пока нет заметок."
              : "Ничего не найдено"}
          </div>
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

      {modalOpen && spaceId ? (
        <NewNoteModal
          spaceId={spaceId}
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
