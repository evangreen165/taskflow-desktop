import { useEffect, useState } from "react";

import Skeleton from "@/components/ui/Skeleton";
import { appNavigate } from "@/lib/navigate";
import { PluginsService, type PluginManifest } from "@/services/plugins";

import styles from "./PluginsPage.module.css";

export default function PluginsPage(): JSX.Element {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void PluginsService.list().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setPlugins(result.value);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <h1>Расширения</h1>
      <p className={styles.muted}>
        Плагины — это изолированные HTML-страницы в папке <code>{`{workspace}/plugins/`}</code>.
      </p>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={styles.card}>
              <Skeleton height={16} width="55%" />
              <Skeleton height={11} width="35%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.empty}>{error}</div>
      ) : plugins.length === 0 ? (
        <div className={styles.empty}>
          Плагины не найдены. Поместите папку плагина в <code>{`{workspace}/plugins/`}</code>.
        </div>
      ) : (
        <div className={styles.grid}>
          {plugins.map((plugin) => (
            <div key={plugin.id} className={styles.card}>
              <h2>{plugin.name}</h2>
              <p className={styles.muted}>
                v{plugin.version} · {plugin.id}
              </p>
              <button
                className="btn-primary"
                type="button"
                onClick={() => appNavigate(`/app/plugins/${encodeURIComponent(plugin.id)}`)}
              >
                Открыть
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
