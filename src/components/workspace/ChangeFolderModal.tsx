import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { appNavigate } from "@/lib/navigate";
import { WorkspaceService } from "@/services/workspace";
import { useAppStore } from "@/stores/useAppStore";

import styles from "./ChangeFolderModal.module.css";

/**
 * Safe "change folder" flow: shows the current workspace and only switches
 * after the user picks and validates a new folder. Cancelling the native
 * dialog leaves the session untouched.
 */
export default function ChangeFolderModal({ onClose }: { onClose: () => void }): JSX.Element {
  const workspace = useAppStore((s) => s.workspace);
  const switchWorkspace = useAppStore((s) => s.switchWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(): Promise<void> {
    setError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Выберите папку workspace",
    });
    if (typeof selected !== "string") {
      // Native dialog cancelled: stay exactly where we were.
      return;
    }
    setBusy(true);
    const inspection = await WorkspaceService.inspectFolder(selected);
    setBusy(false);
    if (!inspection.ok) {
      setError(inspection.error.message);
      return;
    }
    if (!inspection.value.isDir) {
      setError("Папка не найдена или недоступна.");
      return;
    }
    switchWorkspace();
    onClose();
    appNavigate("/onboarding", { state: { path: selected } });
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Сменить папку</h3>
        <p className={styles.label}>Текущее пространство:</p>
        <div className={styles.path}>{workspace?.path ?? "—"}</div>
        {error ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        ) : null}
        <p className={styles.hint}>
          Сессия и текущий workspace сохранятся, пока вы не выберете новую папку.
        </p>
        <div className={styles.actions}>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" type="button" disabled={busy} onClick={() => void pick()}>
            {busy ? "Проверка…" : "Изменить папку"}
          </button>
        </div>
      </div>
    </div>
  );
}
