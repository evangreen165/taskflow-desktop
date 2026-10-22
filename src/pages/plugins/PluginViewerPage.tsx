import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PluginsService } from "@/services/plugins";

import styles from "./PluginViewerPage.module.css";

export default function PluginViewerPage(): JSX.Element {
  const { pluginId } = useParams<{ pluginId: string }>();
  const navigate = useNavigate();
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
          className={styles.frame}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={html}
          title={`Плагин ${pluginId}`}
        />
      )}
    </div>
  );
}
