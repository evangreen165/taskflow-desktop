import packageJson from "@/../package.json";

import { useAppStore } from "@/stores/useAppStore";
import { useThemeStore, type AppTheme } from "@/stores/useThemeStore";

import styles from "./SettingsPage.module.css";

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

export default function SettingsPage(): JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const workspace = useAppStore((s) => s.workspace);

  return (
    <div className={styles.page}>
      <h1>Настройки</h1>

      <div className={styles.card}>
        <h2>Оформление</h2>
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

      <div className={styles.card}>
        <h2>О программе</h2>
        <dl className={styles.kv}>
          <dt>Версия</dt>
          <dd>{packageJson.version}</dd>
          <dt>Workspace</dt>
          <dd className={styles.path}>{workspace?.path ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
