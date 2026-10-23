import { useCallback, useEffect, useRef } from "react";

import { LlmService } from "@/services/llm";
import { NotesService } from "@/services/notes";
import { TasksService, type TaskPriority } from "@/services/tasks";
import { usePluginStore } from "@/stores/usePluginStore";
import { useSpaceStore } from "@/stores/useSpaceStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useToastStore } from "@/stores/useToastStore";

import styles from "./PluginFrame.module.css";

const PLUGIN_REQUEST = "taskflow:request";
const PLUGIN_RESPONSE = "taskflow:response";

/**
 * Loads a plugin's entry HTML into a sandboxed iframe and hosts the postMessage
 * bridge between the plugin and the TaskFlow core.
 */
export default function PluginFrame({ pluginId }: { pluginId: string }): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const pushToast = useToastStore((s) => s.push);

  /**
   * Whitelisted plugin actions. Read-only plus note creation and the LLM proxy;
   * task deletion, role changes, etc. are intentionally absent. The backend
   * enforces the current user's permissions for every call.
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
        case "createTask": {
          const title = payload.title;
          if (typeof title !== "string" || !title.trim()) {
            throw new Error("Параметр title обязателен");
          }
          const priority: TaskPriority =
            payload.priority === "low" ||
            payload.priority === "medium" ||
            payload.priority === "high" ||
            payload.priority === "critical"
              ? payload.priority
              : "medium";
          const description = typeof payload.description === "string" ? payload.description : "";
          const dueDate =
            typeof payload.dueDate === "string" && payload.dueDate.trim() ? payload.dueDate : null;
          const assignees = Array.isArray(payload.assignees)
            ? payload.assignees.filter((value): value is string => typeof value === "string")
            : [];
          const tags = Array.isArray(payload.tags)
            ? payload.tags.filter((value): value is string => typeof value === "string")
            : [];
          const result = await TasksService.create(spaceId, {
            title: title.trim(),
            description,
            priority,
            dueDate,
            assignees,
            tags,
          });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "createCategory": {
          const name = payload.name;
          if (typeof name !== "string" || !name.trim()) {
            throw new Error("Параметр name обязателен");
          }
          const result = await NotesService.createCategory(spaceId, name.trim());
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
        case "getTheme": {
          const theme = useThemeStore.getState().theme;
          if (theme === "dark" || theme === "light") {
            return theme;
          }
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        case "setBusy": {
          usePluginStore.getState().setBusy(pluginId, payload.busy === true);
          return null;
        }
        case "llmGet": {
          const url = payload.url;
          if (typeof url !== "string" || !url) {
            throw new Error("Параметр url обязателен");
          }
          const result = await LlmService.get(url);
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        case "llmChat": {
          const url = payload.url;
          const body = payload.body;
          if (typeof url !== "string" || !url) {
            throw new Error("Параметр url обязателен");
          }
          if (typeof body !== "string" || !body) {
            throw new Error("Параметр body обязателен");
          }
          const apiKey = typeof payload.apiKey === "string" ? payload.apiKey : "";
          const result = await LlmService.proxy(url, apiKey, body);
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return result.value;
        }
        default:
          throw new Error(`Неизвестное действие плагина: ${action}`);
      }
    },
    [spaceId, pushToast, pluginId],
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
      const pluginOrigin =
        event.origin.startsWith("plugin://") ||
        event.origin.startsWith("http://plugin.localhost") ||
        event.origin.startsWith("https://plugin.localhost") ||
        event.origin === "null" ||
        event.origin === "";
      if (!pluginOrigin) {
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
    <div className={styles.root}>
      <iframe
        ref={iframeRef}
        className={styles.frame}
        sandbox="allow-scripts allow-same-origin"
        src={`plugin://${encodeURIComponent(pluginId)}/index.html`}
        title={`Плагин ${pluginId}`}
      />
    </div>
  );
}
