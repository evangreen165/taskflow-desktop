import { useEffect, useRef, useState } from "react";

import { appNavigate } from "@/lib/navigate";
import type { Notification, NotificationType } from "@/services/notifications";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useSpaceStore } from "@/stores/useSpaceStore";

import styles from "./NotificationBell.module.css";

const TYPE_ICONS: Record<NotificationType, string> = {
  task_assigned: "📋",
  comment_mention: "💬",
  space_added: "📁",
};

/** Compact relative timestamp for the notification list. */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) {
    return "только что";
  }
  if (minutes < 60) {
    return `${minutes} мин назад`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ч назад`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} дн назад`;
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

/** Bell button with unread dot and a dropdown notification panel. */
export default function NotificationBell(): JSX.Element {
  const items = useNotificationStore((s) => s.items);
  const fetchNotifications = useNotificationStore((s) => s.fetch);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const setCurrentSpace = useSpaceStore((s) => s.setCurrentSpace);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const unread = items.filter((item) => !item.isRead).length;

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle(): void {
    const next = !open;
    setOpen(next);
    if (next) {
      void fetchNotifications();
    }
  }

  async function openNotification(notification: Notification): Promise<void> {
    if (!notification.isRead) {
      await markRead(notification.id);
    }
    setOpen(false);
    if (!notification.linkTo) {
      return;
    }
    const queryIndex = notification.linkTo.indexOf("?");
    if (queryIndex >= 0) {
      const params = new URLSearchParams(notification.linkTo.slice(queryIndex + 1));
      const space = params.get("space");
      if (space) {
        setCurrentSpace(space);
      }
    }
    appNavigate(notification.linkTo);
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bell}
        aria-label="Уведомления"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Уведомления">
          <div className={styles.header}>
            <span>Уведомления</span>
            {unread > 0 ? (
              <button type="button" className={styles.markAll} onClick={() => void markAllRead()}>
                Отметить все как прочитанные
              </button>
            ) : null}
          </div>
          <div className={styles.list}>
            {items.length === 0 ? (
              <div className={styles.empty}>Нет уведомлений</div>
            ) : (
              items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`${styles.item} ${notification.isRead ? "" : styles.unread}`}
                  onClick={() => void openNotification(notification)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {TYPE_ICONS[notification.type]}
                  </span>
                  <span className={styles.body}>
                    <span className={styles.title}>{notification.title}</span>
                    <span className={styles.message}>{notification.message}</span>
                    <span className={styles.time}>{formatRelative(notification.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
