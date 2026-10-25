import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

import packageJson from "@/../package.json";

import ChangeFolderModal from "@/components/workspace/ChangeFolderModal";
import { usePermissions } from "@/hooks/usePermissions";
import { PluginsService, type PluginManifest } from "@/services/plugins";
import { UpdaterService, type OfflineUpdate } from "@/services/updater";
import { WorkspaceService } from "@/services/workspace";
import { useAppStore } from "@/stores/useAppStore";
import { usePluginStore } from "@/stores/usePluginStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useThemeStore, type AppTheme } from "@/stores/useThemeStore";
import { useToastStore } from "@/stores/useToastStore";

import styles from "./SettingsPage.module.css";

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

type SettingsTab = "general" | "appearance" | "behavior" | "extensions" | "about";

export default function SettingsPage(): JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const hideEmptyColumns = useSettingsStore((s) => s.hideEmptyColumns);
  const setHideEmptyColumns = useSettingsStore((s) => s.setHideEmptyColumns);
  const workspace = useAppStore((s) => s.workspace);
  const pushToast = useToastStore((s) => s.push);
  const { can } = usePermissions();
  const extensionsEnabled = usePluginStore((s) => s.extensionsEnabled);
  const pluginStates = usePluginStore((s) => s.pluginStates);
  const extensionsLoaded = usePluginStore((s) => s.extensionsLoaded);
  const loadExtensions = usePluginStore((s) => s.loadExtensions);
  const setExtensionsEnabled = usePluginStore((s) => s.setExtensionsEnabled);
  const setPluginState = usePluginStore((s) => s.setPluginState);
  const [pluginList, setPluginList] = useState<PluginManifest[]>([]);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [changeFolderOpen, setChangeFolderOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [onlineUpdate, setOnlineUpdate] = useState<Update | null>(null);
  const [offlineUpdate, setOfflineUpdate] = useState<OfflineUpdate | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [sessionDays, setSessionDays] = useState("30");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [importCategory, setImportCategory] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [taskSettings, setTaskSettings] = useState({ trashRetentionDays: "7", dueSoonNotifyMinutes: "60" });
  const [taskSettingsBusy, setTaskSettingsBusy] = useState(false);

  // Load the extension-system settings, installed plugins, and (for admins)
  // the session lifetime once.
  useEffect(() => {
    void loadExtensions();
    let cancelled = false;
    void PluginsService.list().then((result) => {
      if (!cancelled && result.ok) {
        setPluginList(result.value);
      }
    });
    if (can("workspace.settings")) {
      void WorkspaceService.getSessionLifetime().then((result) => {
        if (!cancelled && result.ok) {
          setSessionDays(String(result.value));
        }
      });
      void WorkspaceService.getImportSettings().then((result) => {
        if (!cancelled && result.ok) {
          setImportCategory(result.value);
        }
      });
      void WorkspaceService.getTaskSettings().then((result) => {
        if (!cancelled && result.ok) {
          setTaskSettings({
            trashRetentionDays: String(result.value.trashRetentionDays),
            dueSoonNotifyMinutes: String(result.value.dueSoonNotifyMinutes),
          });
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [can, loadExtensions]);

  async function saveImportSettings(value: boolean): Promise<void> {
    setImportBusy(true);
    const result = await WorkspaceService.setImportSettings(value);
    setImportBusy(false);
    if (!result.ok) {
      pushToast(result.error.message, "error");
      return;
    }
    setImportCategory(result.value);
  }

  async function saveTaskSettings(): Promise<void> {
    const trash = Number(taskSettings.trashRetentionDays);
    const due = Number(taskSettings.dueSoonNotifyMinutes);
    if (!Number.isFinite(trash) || trash < 0 || !Number.isFinite(due) || due < 0) {
      pushToast("Введите неотрицательные значения", "error");
      return;
    }
    setTaskSettingsBusy(true);
    const result = await WorkspaceService.setTaskSettings({
      trashRetentionDays: Math.floor(trash),
      dueSoonNotifyMinutes: Math.floor(due),
    });
    setTaskSettingsBusy(false);
    if (!result.ok) {
      pushToast(result.error.message, "error");
      return;
    }
    setTaskSettings({
      trashRetentionDays: String(result.value.trashRetentionDays),
      dueSoonNotifyMinutes: String(result.value.dueSoonNotifyMinutes),
    });
    pushToast("Настройки задач сохранены", "success");
  }

  async function openLogs(): Promise<void> {
    const result = await WorkspaceService.openLogFolder();
    if (!result.ok) {
      pushToast(result.error.message, "error");
    }
  }

  function handleClearCache(): void {
    localStorage.clear();
    pushToast("Кэш очищен", "success");
  }

  async function saveSessionLifetime(): Promise<void> {
    const days = Number(sessionDays);
    if (!Number.isFinite(days) || days < 0) {
      pushToast("Введите неотрицательное число дней", "error");
      return;
    }
    setSessionBusy(true);
    setSessionSaved(false);
    const result = await WorkspaceService.setSessionLifetime(Math.floor(days));
    setSessionBusy(false);
    if (!result.ok) {
      pushToast(result.error.message, "error");
      return;
    }
    setSessionDays(String(result.value));
    setSessionSaved(true);
    pushToast("Время жизни сессии сохранено", "success");
  }

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

  async function installOffline(): Promise<void> {
    if (!offlineUpdate?.path) {
      return;
    }
    setInstalling(true);
    setInstallMessage("Запуск установщика…");
    const result = await UpdaterService.installOffline(offlineUpdate.path);
    if (!result.ok) {
      setInstalling(false);
      setInstallMessage(null);
      pushToast(result.error.message, "error");
    }
    // On success the backend launches the installer and exits the app.
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
            { id: "general", label: "Общие" },
            { id: "appearance", label: "Оформление" },
            { id: "behavior", label: "Поведение" },
            { id: "extensions", label: "Расширения" },
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

      {tab === "general" ? (
        <div className={styles.card}>
          <h2>Общие</h2>
          <dl className={styles.kv}>
            <dt>Версия приложения</dt>
            <dd>{packageJson.version}</dd>
            <dt>Workspace</dt>
            <dd className={styles.path}>{workspace?.path ?? "—"}</dd>
          </dl>

          {can("workspace.settings") ? (
            <div className={styles.sessionBlock}>
              <h3>Время жизни сессии</h3>
              <p className={styles.muted}>
                Сколько дней действует «запомнить меня» и открытая сессия. 0 — бессрочно.
              </p>
              <div className={styles.sessionRow}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={sessionDays}
                  onChange={(event) => setSessionDays(event.target.value)}
                />
                <span className={styles.muted}>дней</span>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={sessionBusy}
                  onClick={() => void saveSessionLifetime()}
                >
                  {sessionBusy ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
              {sessionSaved ? <p className={styles.done}>Сохранено.</p> : null}
            </div>
          ) : null}

          {can("workspace.settings") ? (
            <div className={styles.sessionBlock}>
              <h3>Импорт заметок</h3>
              <label className={styles.settingRow}>
                <input
                  type="checkbox"
                  checked={importCategory}
                  disabled={importBusy}
                  onChange={(event) => void saveImportSettings(event.target.checked)}
                />
                <span>Создавать категорию по имени папки при импорте .md файлов</span>
              </label>
            </div>
          ) : null}

          {can("workspace.settings") ? (
            <div className={styles.sessionBlock}>
              <h3>Задачи</h3>
              <p className={styles.muted}>
                Через сколько дней задачи из «На удаление» удаляются навсегда и за сколько минут
                предупреждать о сроке (0 — отключить).
              </p>
              <div className={styles.sessionRow}>
                <span className={styles.muted}>Удаление из корзины:</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={taskSettings.trashRetentionDays}
                  onChange={(event) =>
                    setTaskSettings({ ...taskSettings, trashRetentionDays: event.target.value })
                  }
                />
                <span className={styles.muted}>дн.</span>
              </div>
              <div className={styles.sessionRow}>
                <span className={styles.muted}>Напоминание о сроке:</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={taskSettings.dueSoonNotifyMinutes}
                  onChange={(event) =>
                    setTaskSettings({ ...taskSettings, dueSoonNotifyMinutes: event.target.value })
                  }
                />
                <span className={styles.muted}>мин.</span>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={taskSettingsBusy}
                  onClick={() => void saveTaskSettings()}
                >
                  {taskSettingsBusy ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.sessionBlock}>
            <h3>Диагностика</h3>
            <p className={styles.muted}>Логи приложения хранятся локально на этом компьютере.</p>
            <button className="btn-ghost" type="button" onClick={() => void openLogs()}>
              Открыть папку с логами
            </button>
          </div>

          <div className={styles.updateBlock}>
            <h3>Кэш</h3>
            <p className={styles.muted}>
              Очищает локальные данные приложения (тема, настройки интерфейса). Workspace и
              «запомнить меня» не затрагиваются.
            </p>
            <button className="btn-ghost" type="button" onClick={handleClearCache}>
              Очистить кэш
            </button>
          </div>
        </div>
      ) : null}

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

      {tab === "extensions" ? (
        <div className={styles.card}>
          <h2>Расширения</h2>
          <p className={styles.muted}>
            Система расширений выключена по умолчанию. Включите её, чтобы показывать пункт
            «Расширения» в боковом меню и кнопки плагинов (например, AI-ассистента).
          </p>
          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={extensionsEnabled}
              onChange={(event) => void setExtensionsEnabled(event.target.checked)}
            />
            <span>Включить систему расширений</span>
          </label>

          {extensionsEnabled ? (
            <div className={styles.pluginList}>
              <h3>Установленные расширения</h3>
              {!extensionsLoaded ? (
                <p className={styles.muted}>Загрузка…</p>
              ) : pluginList.length === 0 ? (
                <p className={styles.muted}>Установленных расширений нет.</p>
              ) : (
                pluginList.map((plugin) => (
                  <label key={plugin.id} className={styles.pluginRow}>
                    <input
                      type="checkbox"
                      checked={pluginStates[plugin.id] === true}
                      onChange={(event) => void setPluginState(plugin.id, event.target.checked)}
                    />
                    <span>
                      🧩 {plugin.name}
                      <small className={styles.muted}> v{plugin.version}</small>
                    </span>
                  </label>
                ))
              )}
            </div>
          ) : null}
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
                <p className={styles.muted}>Файл: {offlineUpdate.path ?? "updates/update.json"}</p>
                {offlineUpdate.path ? (
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={installing}
                    onClick={() => void installOffline()}
                  >
                    {installing ? "Запуск…" : "Установить и перезапустить"}
                  </button>
                ) : (
                  <p className={styles.muted}>
                    В манифесте не указан путь к установщику — установите вручную.
                  </p>
                )}
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
