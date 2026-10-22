import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { NotesService } from "@/services/notes";
import { PluginsService } from "@/services/plugins";
import { TasksService } from "@/services/tasks";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useToastStore } from "@/stores/useToastStore";

import styles from "./PluginViewerPage.module.css";

const PLUGIN_REQUEST = "taskflow:request";
const PLUGIN_RESPONSE = "taskflow:response";

export default function PluginViewerPage(): JSX.Element {
  const { pluginId } = useParams<{ pluginId: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const pushToast = useToastStore((s) => s.push);

  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pluginId) {
      return;
    }
    let cancelled = false;
    setHtml(null);
    setError(null);
    void PluginsService.getContent(pluginId).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setHtml(result.value);
      } else {
        setError(result.error.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pluginId]);

  /**
   * Whitelisted plugin actions. Read-only plus note creation; task deletion,
   * role changes, etc. are intentionally absent. The backend enforces the
   * current user's permissions for every call.
   */
  const runAction = useCallback(
    async (action: string, payload: Record<string, unknown>): Promise<unknown> => {
      if (!spaceId) {
        throw new Error("Нет активного пространства");
      }
      switch (action) {
        case "getTasks": {
          const result = await TasksService.list(spaceId, {});
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "getNotes": {
          const result = await NotesService.list(spaceId, {});
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "getNoteContent": {
          const noteId = payload.noteId ?? payload.id;
          if (typeof noteId !== "string" || !noteId.trim()) {
            throw new Error("Параметр noteId обязателен");
          }
          const result = await NotesService.get(spaceId, noteId);
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "createNote": {
          const title = payload.title;
          if (typeof title !== "string" || !title.trim()) {
            throw new Error("Параметр title обязателен");
          }
          const category = typeof payload.category === "string" ? payload.category : "";
          const content = typeof payload.content === "string" ? payload.content : "";
          const result = await NotesService.create(spaceId, { title, category, content });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "showToast": {
          const message = payload.message;
          pushToast(
            typeof message === "string" && message.trim() ? message : "Сообщение от плагина",
            "info",
          );
          return null;
        }
        default:
          throw new Error(`Неизвестное действие плагина: ${action}`);
      }
    },
    [spaceId, pushToast],
  );

  /**
   * Bridge: accepts `taskflow:request` messages only from the plugin iframe,
   * runs the whitelisted action, and posts `taskflow:response` back into it.
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) {
        return;
      }
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== PLUGIN_REQUEST) {
        return;
      }
      const id = typeof data.id === "string" ? data.id : "";
      const action = typeof data.action === "string" ? data.action : "";
      if (!id || !action) {
        return;
      }
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      void runAction(action, payload)
        .then((result) => {
          const win = iframeRef.current?.contentWindow;
          if (win) {
            win.postMessage({ type: PLUGIN_RESPONSE, id, data: result, error: null }, "*");
          }
        })
        .catch((err: unknown) => {
          const win = iframeRef.current?.contentWindow;
          if (win) {
            win.postMessage(
              {
                type: PLUGIN_RESPONSE,
                id,
                data: null,
                error: err instanceof Error ? err.message : String(err),
              },
              "*",
            );
          }
        });
    },
    [runAction],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" type="button" onClick={() => navigate("/app/plugins")}>
          ← К плагинам
        </button>
        <h1>Плагин: {pluginId}</h1>
      </div>
      {error ? (
        <div className={styles.empty}>Не удалось загрузить плагин: {error}</div>
      ) : html === null ? (
        <div className={styles.empty}>Загрузка…</div>
      ) : (
        <iframe
          ref={iframeRef}
          className={styles.frame}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={html}
          title={`Плагин ${pluginId}`}
        />
      )}
    </div>
  );
}
