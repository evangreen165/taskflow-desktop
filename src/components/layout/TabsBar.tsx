import { appNavigate } from "@/lib/navigate";
import { useTabStore } from "@/stores/useTabStore";

import styles from "./TabsBar.module.css";

/** Horizontal tab strip for the workspace main area. */
export default function TabsBar(): JSX.Element | null {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);

  if (tabs.length === 0) {
    return null;
  }

  function activate(tab: { id: string; path: string; title: string }): void {
    useTabStore.getState().setActiveTab(tab.id);
    appNavigate(tab.path, { title: tab.title });
  }

  function close(id: string): void {
    const wasActive = id === activeTabId;
    closeTab(id);
    if (wasActive) {
      const state = useTabStore.getState();
      const next = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (next) {
        appNavigate(next.path, { title: next.title });
      } else {
        appNavigate("/app/dashboard");
      }
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
