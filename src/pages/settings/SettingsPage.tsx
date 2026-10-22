import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

import packageJson from "@/../package.json";

import ChangeFolderModal from "@/components/workspace/ChangeFolderModal";
import { UpdaterService, type OfflineUpdate } from "@/services/updater";
import { useAppStore } from "@/stores/useAppStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useThemeStore, type AppTheme } from "@/stores/useThemeStore";
import { useToastStore } from "@/stores/useToastStore";

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
  const pushToast = useToastStore((s) => s.push);
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [changeFolderOpen, setChangeFolderOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [onlineUpdate, setOnlineUpdate] = useState<Update | null>(null);
  const [offlineUpdate, setOfflineUpdate] = useState<OfflineUpdate | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  async function checkUpdates(): Promise<void> {
    setChecking(true);
    setChecked(false);
    setOnlineUpdate(null);
    setOfflineUpdate(null);
    setOnlineError(null);
    setInstallMessage(null);

    // Offline drop-in file first: it must work without network access.
    const offline = await UpdaterService.checkOffline();
    if (offline.ok) {
      setOfflineUpdate(offline.value);
    } else {
      pushToast(offline.error.message, "error");
    }

    try {
      const online = await UpdaterService.checkOnline();
      setOnlineUpdate(online);
      if (online) {
        pushToast(`Доступно обновление ${online.version}`, "success");
      }
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : String(error));
    }

    setChecked(true);
    setChecking(false);
  }

  async function installOnline(): Promise<void> {
    if (!onlineUpdate) {
      return;
    }
    setInstalling(true);
    setInstallMessage("Загрузка обновления…");
    let downloaded = 0;
    let total = 0;
    try {
      await onlineUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setInstallMessage("Загрузка обновления…");
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setInstallMessage(
              `Загрузка… ${Math.min(100, Math.round((downloaded / total) * 100))}%`,
            );
          }
        } else {
          setInstallMessage("Установка…");
        }
      });
      setInstallMessage("Обновление установлено. Перезапустите приложение.");
      pushToast("Обновление установлено", "success");
    } catch (error) {
      setInstallMessage(null);
      pushToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setInstalling(false);
    }
  }

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

          <div className={styles.updateBlock}>
            <h3>Обновления</h3>
            <p className={styles.muted}>
              Проверяет онлайн-канал и файл <code>updates/update.json</code> в папке workspace.
            </p>
            <button
              className="btn-primary"
              type="button"
              disabled={checking}
              onClick={() => void checkUpdates()}
            >
              {checking ? "Проверка…" : "Проверить обновления"}
            </button>

            {onlineUpdate ? (
              <div className={styles.updateCard}>
                <strong>Доступна версия {onlineUpdate.version}</strong>
                {onlineUpdate.body ? <p>{onlineUpdate.body}</p> : null}
                <button
                  className="btn-primary"
                  type="button"
                  disabled={installing}
                  onClick={() => void installOnline()}
                >
                  {installing ? "Загрузка…" : "Скачать и установить"}
                </button>
              </div>
            ) : null}

            {offlineUpdate ? (
              <div className={styles.updateCard}>
                <strong>Офлайн-обновление {offlineUpdate.version}</strong>
                {offlineUpdate.notes ? <p>{offlineUpdate.notes}</p> : null}
                <p className={styles.muted}>
                  Файл: {offlineUpdate.path ?? "updates/update.json"}. Установите вручную.
                </p>
              </div>
            ) : null}

            {installMessage ? <p className={styles.muted}>{installMessage}</p> : null}

            {checked && !onlineUpdate && !offlineUpdate && onlineError ? (
              <p className={styles.muted}>Онлайн-проверка недоступна: {onlineError}</p>
            ) : null}
            {checked && !onlineUpdate && !offlineUpdate && !onlineError ? (
              <p className={styles.muted}>Обновлений не найдено.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {changeFolderOpen ? <ChangeFolderModal onClose={() => setChangeFolderOpen(false)} /> : null}
    </div>
  );
}
