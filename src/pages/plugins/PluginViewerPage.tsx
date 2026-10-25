import { useParams } from "react-router-dom";

import PluginFrame from "@/components/plugins/PluginFrame";
import { appNavigate } from "@/lib/navigate";

import styles from "./PluginViewerPage.module.css";

export default function PluginViewerPage({
  pluginId: pluginIdProp,
}: { pluginId?: string } = {}): JSX.Element {
  const { pluginId: routePluginId } = useParams<{ pluginId: string }>();
  const pluginId = pluginIdProp ?? routePluginId;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" type="button" onClick={() => appNavigate("/app/plugins")}>
          ← К плагинам
        </button>
        <h1>Плагин: {pluginId}</h1>
      </div>
      {pluginId ? <PluginFrame pluginId={pluginId} /> : null}
    </div>
  );
}
