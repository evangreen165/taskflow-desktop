import { useNavigate, useParams } from "react-router-dom";

import PluginFrame from "@/components/plugins/PluginFrame";

import styles from "./PluginViewerPage.module.css";

export default function PluginViewerPage({
  pluginId: pluginIdProp,
}: { pluginId?: string } = {}): JSX.Element {
  const { pluginId: routePluginId } = useParams<{ pluginId: string }>();
  const pluginId = pluginIdProp ?? routePluginId;
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" type="button" onClick={() => navigate("/app/plugins")}>
          ← К плагинам
        </button>
        <h1>Плагин: {pluginId}</h1>
      </div>
      {pluginId ? <PluginFrame pluginId={pluginId} /> : null}
    </div>
  );
}
