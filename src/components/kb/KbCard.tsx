import { categoryIcon, formatDate, NOTE_STATUS_LABELS, truncatePreview } from "@/lib/kbMeta";
import type { NoteListItem } from "@/services/notes";
import type { UserSummary } from "@/services/users";

import styles from "./KbCard.module.css";

interface KbCardProps {
  item: NoteListItem;
  author: UserSummary | undefined;
  onOpen: () => void;
}

export default function KbCard({ item, author, onOpen }: KbCardProps): JSX.Element {
  const preview = item.preview.trim() ? truncatePreview(item.preview) : "Нет описания";

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.head}>
        <span className={styles.icon}>{categoryIcon(item.category)}</span>
        {item.status === "draft" ? (
          <span className={styles.draftBadge}>{NOTE_STATUS_LABELS.draft}</span>
        ) : null}
      </div>

      <div className={styles.title}>{item.title}</div>
      <div className={styles.preview}>{preview}</div>

      {item.tags.length > 0 ? (
        <div className={styles.tags}>
          {item.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.foot}>
        <span className={styles.author}>{author?.displayName ?? "—"}</span>
        <span className={styles.date}>{formatDate(item.updatedAt)}</span>
      </div>
    </button>
  );
}
