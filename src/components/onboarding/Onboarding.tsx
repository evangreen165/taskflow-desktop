import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useAppStore } from "@/stores/useAppStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { StorageService } from "@/services/storage";
import {
  AuthService,
  WorkspaceService,
  type FolderInspection,
  type WorkspaceInfo,
} from "@/services/workspace";

import styles from "./Onboarding.module.css";

type Step = "folder" | "workspace" | "admin" | "login";

const LOGIN_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const MIN_PASSWORD = 8;

async function resolveWorkspaceInfo(current: WorkspaceInfo | null): Promise<WorkspaceInfo | null> {
  if (current) {
    return current;
  }
  const session = await WorkspaceService.getSession();
  return session.ok ? session.value.workspace : null;
}

export default function Onboarding(): JSX.Element {
  const activateAndPersist = useAppStore((s) => s.activateAndPersist);
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<Step>("folder");
  const [path, setPath] = useState("");
  const [inspection, setInspection] = useState<FolderInspection | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [workspaceName, setWorkspaceName] = useState("TaskFlow");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");

  const isExisting = inspection?.isWorkspace === true;
  const labels = isExisting ? ["Папка", "Вход"] : ["Папка", "Workspace", "Администратор"];
  const activeIndex = step === "folder" ? 0 : step === "login" ? 1 : step === "workspace" ? 1 : 2;

  function resetMessages(): void {
    setError(null);
  }

  async function inspect(candidate: string): Promise<void> {
    if (!candidate.trim()) {
      return;
    }
    setChecking(true);
    resetMessages();
    const result = await WorkspaceService.inspectFolder(candidate);
    setChecking(false);
    if (!result.ok) {
      setInspection(null);
      setError(result.error.message);
      return;
    }
    setInspection(result.value);
  }

  async function pickFolder(): Promise<void> {
    resetMessages();
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Выберите папку TaskFlowData на SMB-шаре или диске",
    });
    if (typeof selected !== "string") {
      return;
    }
    setPath(selected);
    setWorkspaceInfo(null);
    await inspect(selected);
  }

  async function openExisting(): Promise<void> {
    setBusy(true);
    resetMessages();
    const activated = await WorkspaceService.activateWorkspace(path);
    if (!activated.ok) {
      setBusy(false);
      setError(activated.error.message);
      return;
    }
    setWorkspaceInfo(activated.value);
    const users = await StorageService.listDir("users", { extensions: ["json"] });
    setBusy(false);
    if (users.ok && users.value.length > 0) {
      setStep("login");
    } else {
      setStep("admin");
    }
  }

  async function createWorkspace(): Promise<void> {
    setBusy(true);
    resetMessages();
    const created = await WorkspaceService.initWorkspace(path, workspaceName.trim());
    setBusy(false);
    if (!created.ok) {
      setError(created.error.message);
      return;
    }
    setWorkspaceInfo(created.value);
    setStep("admin");
  }

  function validateCredentials(): string | null {
    if (!LOGIN_PATTERN.test(loginName)) {
      return "Логин: строчные латинские буквы, цифры, «.», «_», «-»; начинается с буквы.";
    }
    if (password.length < MIN_PASSWORD) {
      return `Пароль должен содержать не менее ${MIN_PASSWORD} символов.`;
    }
    if (password !== passwordConfirm) {
      return "Пароли не совпадают.";
    }
    if (step === "admin" && !fullName.trim()) {
      return "Укажите ФИО администратора.";
    }
    return null;
  }

  async function submitAdmin(): Promise<void> {
    const validation = validateCredentials();
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    resetMessages();
    const created = await AuthService.createAdmin(loginName, password, fullName.trim());
    if (!created.ok) {
      setBusy(false);
      setError(created.error.message);
      return;
    }
    useAuthStore.getState().setUser(created.value);
    const info = await resolveWorkspaceInfo(workspaceInfo);
    setBusy(false);
    if (info) {
      await activateAndPersist(info);
    }
  }

  async function submitLogin(): Promise<void> {
    if (!loginName.trim() || !password) {
      setError("Введите логин и пароль.");
      return;
    }
    setBusy(true);
    resetMessages();
    const result = await login(loginName.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const info = await resolveWorkspaceInfo(workspaceInfo);
    if (info) {
      await activateAndPersist(info);
    }
  }

  function backToFolder(): void {
    resetMessages();
    setStep("folder");
    setInspection(null);
    setWorkspaceInfo(null);
    setPassword("");
    setPasswordConfirm("");
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.mark}>T</div>
          <div className={styles.brandText}>
            <h1>TaskFlow</h1>
            <span>Первый запуск · настройка workspace</span>
          </div>
        </div>

        <div className={styles.steps}>
          {labels.map((label, index) => (
            <StepItem
              key={label}
              label={label}
              index={index}
              activeIndex={activeIndex}
              last={index === labels.length - 1}
            />
          ))}
        </div>

        {error ? (
          <div className="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        {step === "folder" ? (
          <FolderStep
            path={path}
            checking={checking}
            inspection={inspection}
            busy={busy}
            onPathChange={(value) => {
              setPath(value);
              setWorkspaceInfo(null);
              setInspection(null);
            }}
            onInspect={() => void inspect(path)}
            onPick={() => void pickFolder()}
            onOpenExisting={() => void openExisting()}
            onContinue={() => {
              resetMessages();
              setStep("workspace");
            }}
          />
        ) : null}

        {step === "workspace" ? (
          <WorkspaceStep
            path={path}
            name={workspaceName}
            busy={busy}
            onNameChange={setWorkspaceName}
            onBack={backToFolder}
            onCreate={() => void createWorkspace()}
          />
        ) : null}

        {step === "admin" ? (
          <CredentialsStep
            title="Первый администратор"
            subtitle="Учётная запись администратора workspace. Пароль хранится только в виде хеша Argon2."
            submitLabel="Создать администратора"
            busy={busy}
            login={loginName}
            password={password}
            passwordConfirm={passwordConfirm}
            fullName={fullName}
            onLoginChange={setLoginName}
            onPasswordChange={setPassword}
            onPasswordConfirmChange={setPasswordConfirm}
            onFullNameChange={setFullName}
            onBack={backToFolder}
            onSubmit={() => void submitAdmin()}
          />
        ) : null}

        {step === "login" ? (
          <CredentialsStep
            title="Вход в workspace"
            subtitle={`Workspace «${inspection?.workspaceName ?? ""}» уже существует. Войдите под своей учётной записью.`}
            submitLabel="Войти"
            busy={busy}
            login={loginName}
            password={password}
            passwordConfirm={null}
            fullName={null}
            onLoginChange={setLoginName}
            onPasswordChange={setPassword}
            onPasswordConfirmChange={() => undefined}
            onFullNameChange={() => undefined}
            onBack={backToFolder}
            onSubmit={() => void submitLogin()}
          />
        ) : null}

        <div className={styles.footer}>
          Данные хранятся только в выбранной папке. Приложение не использует сеть и не запускает
          сервер.
        </div>
      </div>
    </div>
  );
}

interface StepItemProps {
  label: string;
  index: number;
  activeIndex: number;
  last: boolean;
}

function StepItem({ label, index, activeIndex, last }: StepItemProps): JSX.Element {
  const state = index === activeIndex ? "active" : index < activeIndex ? "done" : "";
  return (
    <>
      <div className={`${styles.step} ${state ? styles[state] : ""}`}>
        <span className={styles.dot}>{index + 1}</span>
        {label}
      </div>
      {last ? null : <span className={styles.stepLine} />}
    </>
  );
}

interface FolderStepProps {
  path: string;
  checking: boolean;
  inspection: FolderInspection | null;
  busy: boolean;
  onPathChange: (value: string) => void;
  onInspect: () => void;
  onPick: () => void;
  onOpenExisting: () => void;
  onContinue: () => void;
}

function FolderStep(props: FolderStepProps): JSX.Element {
  const { inspection } = props;
  return (
    <>
      <div className={styles.title}>Папка данных</div>
      <div className={styles.subtitle}>
        Укажите общую папку на SMB-шаре (или локальную папку), в которой будет храниться workspace
        TaskFlow.
      </div>

      <div className={styles.pathRow}>
        <input
          type="text"
          value={props.path}
          placeholder="\\\\server\\share\\TaskFlowData"
          spellCheck={false}
          onChange={(event) => props.onPathChange(event.target.value)}
        />
        <button className="btn-ghost" type="button" onClick={props.onPick}>
          Обзор…
        </button>
      </div>

      {inspection ? (
        <div
          className={`${styles.status} ${
            inspection.isWorkspace ? styles.ok : inspection.isDir ? styles.info : styles.warn
          }`}
        >
          {inspection.isWorkspace
            ? `Найден workspace «${inspection.workspaceName ?? ""}» (schema v${inspection.schemaVersion ?? "?"}).`
            : inspection.isDir
              ? "Папка существует и пуста — здесь можно создать новый workspace."
              : "Папка не найдена. Проверьте путь и доступ к шарe."}
        </div>
      ) : (
        <div className={styles.status}>
          Выберите папку или введите путь вручную и нажмите «Проверить».
        </div>
      )}

      <div className={styles.actions}>
        <button
          className="btn-ghost"
          type="button"
          disabled={props.checking}
          onClick={props.onInspect}
        >
          {props.checking ? "Проверка…" : "Проверить"}
        </button>
        <div className={styles.spacer} />
        {inspection?.isWorkspace ? (
          <button
            className="btn-primary"
            type="button"
            disabled={props.busy}
            onClick={props.onOpenExisting}
          >
            Открыть workspace
          </button>
        ) : (
          <button
            className="btn-primary"
            type="button"
            disabled={!inspection?.isDir || props.busy}
            onClick={props.onContinue}
          >
            Создать workspace
          </button>
        )}
      </div>
    </>
  );
}

interface WorkspaceStepProps {
  path: string;
  name: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onCreate: () => void;
}

function WorkspaceStep(props: WorkspaceStepProps): JSX.Element {
  return (
    <>
      <div className={styles.title}>Новый workspace</div>
      <div className={styles.subtitle}>
        Будет создана структура папок и файл config.json в <b>{props.path}</b>.
      </div>
      <div className="field">
        <label htmlFor="ws-name">Название workspace</label>
        <input
          id="ws-name"
          type="text"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
        />
        <span className="hint">Например: «Внедрение CRM» или «Компания».</span>
      </div>
      <div className={styles.actions}>
        <button className="btn-ghost" type="button" onClick={props.onBack}>
          Назад
        </button>
        <div className={styles.spacer} />
        <button
          className="btn-primary"
          type="button"
          disabled={props.busy || !props.name.trim()}
          onClick={props.onCreate}
        >
          {props.busy ? "Создание…" : "Создать"}
        </button>
      </div>
    </>
  );
}

interface CredentialsStepProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  busy: boolean;
  login: string;
  password: string;
  passwordConfirm: string | null;
  fullName: string | null;
  onLoginChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordConfirmChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

function CredentialsStep(props: CredentialsStepProps): JSX.Element {
  return (
    <>
      <div className={styles.title}>{props.title}</div>
      <div className={styles.subtitle}>{props.subtitle}</div>

      <div className="field">
        <label htmlFor="login">Логин</label>
        <input
          id="login"
          type="text"
          value={props.login}
          autoComplete="username"
          spellCheck={false}
          onChange={(event) => props.onLoginChange(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          value={props.password}
          autoComplete="current-password"
          onChange={(event) => props.onPasswordChange(event.target.value)}
        />
        <span className="hint">Не менее 8 символов.</span>
      </div>

      {props.passwordConfirm !== null ? (
        <div className="field">
          <label htmlFor="password-confirm">Повторите пароль</label>
          <input
            id="password-confirm"
            type="password"
            value={props.passwordConfirm}
            autoComplete="new-password"
            onChange={(event) => props.onPasswordConfirmChange(event.target.value)}
          />
        </div>
      ) : null}

      {props.fullName !== null ? (
        <div className="field">
          <label htmlFor="full-name">ФИО</label>
          <input
            id="full-name"
            type="text"
            value={props.fullName}
            onChange={(event) => props.onFullNameChange(event.target.value)}
          />
        </div>
      ) : null}

      <div className={styles.actions}>
        <button className="btn-ghost" type="button" onClick={props.onBack}>
          Назад
        </button>
        <div className={styles.spacer} />
        <button
          className="btn-primary"
          type="button"
          disabled={props.busy}
          onClick={props.onSubmit}
        >
          {props.busy ? "Подождите…" : props.submitLabel}
        </button>
      </div>
    </>
  );
}
