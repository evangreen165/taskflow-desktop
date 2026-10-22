import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";

import { categoryIcon } from "@/lib/kbMeta";
import { SearchService, type GlobalSearchResults } from "@/services/search";
import { useRecentStore, type RecentKind } from "@/stores/useRecentStore";
import { useSpaceStore } from "@/stores/useSpaceStore";

import styles from "./CommandPalette.module.css";

const DEBOUNCE_MS = 300;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global search (Ctrl/Cmd+K): tasks and notes across every space the user may
 * access. Keystrokes are debounced before hitting the backend.
 */
export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps): JSX.Element {
  const navigate = useNavigate();
  const setCurrentSpace = useSpaceStore((s) => s.setCurrentSpace);
  const recents = useRecentStore((s) => s.items);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset everything once the palette is dismissed.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  // Debounce keystrokes so the backend is not hit on every character.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void SearchService.global(debounced).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      setResults(result.ok ? result.value : { tasks: [], notes: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  function go(kind: RecentKind, id: string, spaceId: string): void {
    if (spaceId) {
      setCurrentSpace(spaceId);
    }
    onOpenChange(false);
    if (kind === "task") {
      navigate(`/app/tasks?task=${encodeURIComponent(id)}`);
    } else {
      navigate(`/app/kb/${encodeURIComponent(id)}`);
    }
  }

  const hasQuery = query.trim().length > 0;
  const tasks = results?.tasks ?? [];
  const notes = results?.notes ?? [];
  const noResults = hasQuery && !loading && tasks.length === 0 && notes.length === 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Глобальный поиск"
      shouldFilter={false}
      overlayClassName={styles.overlay ?? ""}
      contentClassName={styles.dialog ?? ""}
      className={styles.command ?? ""}
    >
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Поиск задач и заметок…"
        className={styles.input}
      />
      <Command.List className={styles.list}>
        {loading ? <div className={styles.loading}>Поиск…</div> : null}

        {!hasQuery ? (
          recents.length > 0 ? (
            <Command.Group heading="Недавние" className={styles.group}>
              {recents.map((item) => (
                <Command.Item
                  key={`recent:${item.kind}:${item.id}`}
                  value={`recent:${item.kind}:${item.id}`}
                  onSelect={() => go(item.kind, item.id, item.spaceId)}
                  className={styles.item}
                >
                  <span className={styles.itemIcon}>{item.kind === "task" ? "📋" : "📖"}</span>
                  <span className={styles.itemTitle}>{item.title}</span>
                  <span className={styles.itemMeta}>
                    {item.kind === "task" ? "Задача" : "Заметка"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : (
            <div className={styles.empty}>
              Начните вводить запрос, чтобы найти задачи и заметки.
            </div>
          )
        ) : null}

        {hasQuery && tasks.length > 0 ? (
          <Command.Group heading="Задачи" className={styles.group}>
            {tasks.map((task) => (
              <Command.Item
                key={`task:${task.id}`}
                value={`task:${task.id}`}
                onSelect={() => go("task", task.id, task.spaceId)}
                className={styles.item}
              >
                <span className={styles.itemIcon}>📋</span>
                <span className={styles.itemTitle}>{task.title}</span>
                <span className={styles.itemMeta}>{task.spaceName}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {hasQuery && notes.length > 0 ? (
          <Command.Group heading="Заметки" className={styles.group}>
            {notes.map((note) => (
              <Command.Item
                key={`note:${note.id}`}
                value={`note:${note.id}`}
                onSelect={() => go("note", note.id, note.spaceId)}
                className={styles.item}
              >
                <span className={styles.itemIcon}>{categoryIcon(note.category)}</span>
                <span className={styles.itemTitle}>{note.title}</span>
                <span className={styles.itemMeta}>{note.spaceName}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {noResults ? <div className={styles.empty}>Ничего не найдено.</div> : null}
      </Command.List>
      <div className={styles.footer}>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> навигация
        </span>
        <span>
          <kbd>Enter</kbd> открыть
        </span>
        <span>
          <kbd>Esc</kbd> закрыть
        </span>
      </div>
    </Command.Dialog>
  );
}
