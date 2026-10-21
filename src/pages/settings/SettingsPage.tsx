import { useState } from "react";

import packageJson from "@/../package.json";

import ChangeFolderModal from "@/components/workspace/ChangeFolderModal";
import { useAppStore } from "@/stores/useAppStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useThemeStore, type AppTheme } from "@/stores/useThemeStore";

import styles from "./SettingsPage.module.css";

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

type SettingsTab = "appearance" | "behavior" | "about";

export default function SettingsPage(): JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const hideEmptyColumns = useSettingsStore((s) => s.hideEmptyColumns);
  const setHideEmptyColumns = useSettingsStore((s) => s.setHideEmptyColumns);
  const workspace = useAppStore((s) => s.workspace);
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [changeFolderOpen, setChangeFolderOpen] = useState(false);

  return (
    <div className={styles.page}>
      <h1>Настройки</h1>

      <div className={styles.tabs}>
        {(
          [
            { id: "appearance", label: "Оформление" },
            { id: "behavior", label: "Поведение" },
            { id: "about", label: "О программе" },
          ] as { id: SettingsTab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabActive : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "appearance" ? (
        <div className={styles.card}>
          <h2>Тема</h2>
          <p className={styles.muted}>Тема приложения применяется мгновенно и сохраняется.</p>
          <div className={styles.themeRow}>
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className={styles.themeOption}>
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => setTheme(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "behavior" ? (
        <div className={styles.card}>
          <h2>Поведение</h2>
          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={hideEmptyColumns}
              onChange={(event) => setHideEmptyColumns(event.target.checked)}
            />
            <span>
              Скрывать пустые колонки на Канбане
              <small className={styles.muted}> — «Новая», «В работе» и т.д. без задач</small>
            </span>
          </label>
        </div>
      ) : null}

      {tab === "about" ? (
        <div className={styles.card}>
          <h2>О программе</h2>
          <dl className={styles.kv}>
            <dt>Версия</dt>
            <dd>{packageJson.version}</dd>
            <dt>Workspace</dt>
            <dd className={styles.path}>
              {workspace?.path ?? "—"}
              <button
                className="btn-ghost"
                type="button"
                style={{ marginLeft: 8 }}
                onClick={() => setChangeFolderOpen(true)}
              >
                Сменить
              </button>
            </dd>
          </dl>
        </div>
      ) : null}

      {changeFolderOpen ? <ChangeFolderModal onClose={() => setChangeFolderOpen(false)} /> : null}
    </div>
  );
}
