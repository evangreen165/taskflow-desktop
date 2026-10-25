import { useNavigate } from "react-router-dom";

import { useTabStore } from "@/stores/useTabStore";

import styles from "./TabsBar.module.css";

/** Horizontal tab strip for the workspace main area. */
export default function TabsBar(): JSX.Element | null {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const navigate = useNavigate();

  if (tabs.length === 0) {
    return null;
  }

  function activate(tab: { id: string; path: string }): void {
    useTabStore.getState().setActiveTab(tab.id);
    navigate(tab.path);
  }

  function close(id: string): void {
    const wasActive = id === activeTabId;
    closeTab(id);
    if (wasActive) {
      const state = useTabStore.getState();
      const next = state.tabs.find((tab) => tab.id === state.activeTabId);
      navigate(next ? next.path : "/app/dashboard");
    }
  }

  return (
    <div className={styles.bar} role="tablist" aria-label="Открытые вкладки">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ""}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={styles.label}
            title={tab.title}
            onClick={() => activate(tab)}
          >
            {tab.title}
          </button>
          <button
            type="button"
            className={styles.close}
            title="Закрыть вкладку"
            onClick={() => close(tab.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
