import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";

import { WorkspaceService } from "@/services/workspace";

import styles from "./MarkdownToolbar.module.css";

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  /** Show the `[[…]]` internal-link button (Obsidian plugin enabled). */
  obsidianEnabled?: boolean;
}

interface InsertResult {
  next: string;
  selectionStart: number;
  selectionEnd: number;
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): InsertResult {
  const selected = value.slice(start, end);
  if (selected) {
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    return {
      next,
      selectionStart: start + before.length,
      selectionEnd: start + before.length + selected.length,
    };
  }
  const next = value.slice(0, start) + before + placeholder + after + value.slice(end);
  const cursor = start + before.length;
  return { next, selectionStart: cursor, selectionEnd: cursor + placeholder.length };
}

function prefixLine(value: string, start: number, prefix: string): InsertResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  const cursor = start + prefix.length;
  return { next, selectionStart: cursor, selectionEnd: cursor };
}

const ORDERED_RE = /^\d+\.\s+/;
const BULLET_RE = /^-\s+/;

/** Toggles a list prefix on every selected line (numbered lists are renumbered). */
function applyList(
  value: string,
  start: number,
  end: number,
  ordered: boolean,
): InsertResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const hasPrefix = (line: string): boolean => (ordered ? ORDERED_RE : BULLET_RE).test(line);
  const allPrefixed = lines.every((line) => line.trim() === "" || hasPrefix(line));
  let counter = 1;
  const nextLines = lines.map((line) => {
    if (line.trim() === "") {
      return line;
    }
    if (ordered) {
      if (allPrefixed) {
        return line.replace(ORDERED_RE, "");
      }
      const numbered = line.replace(ORDERED_RE, "");
      return `${counter++}. ${numbered}`;
    }
    if (allPrefixed) {
      return line.replace(BULLET_RE, "");
    }
    return BULLET_RE.test(line) ? line : `- ${line}`;
  });
  const nextBlock = nextLines.join("\n");
  return {
    next: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + nextBlock.length,
  };
}

function buildTable(rows: number, cols: number): string {
  const header = `| ${Array.from({ length: cols }, (_, i) => `Заголовок ${i + 1}`).join(" | ")} |`;
  const separator = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
  const bodyRow = `| ${Array.from({ length: cols }, () => " ").join(" | ")} |`;
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => bodyRow);
  return [header, separator, ...body].join("\n");
}

export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  obsidianEnabled = false,
}: MarkdownToolbarProps): JSX.Element {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesPos, setTemplatesPos] = useState<{ top: number; left: number } | null>(null);
  const templatesBtnRef = useRef<HTMLButtonElement | null>(null);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<{ name: string; content: string }[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  function toggleTemplates(): void {
    if (!templatesOpen && templatesBtnRef.current) {
      const rect = templatesBtnRef.current.getBoundingClientRect();
      setTemplatesPos({ top: rect.bottom + 4, left: rect.left });
    }
    setTemplatesOpen((open) => !open);
  }

  // Refresh custom templates whenever the templates menu opens.
  useEffect(() => {
    if (!templatesOpen) {
      return;
    }
    let cancelled = false;
    void WorkspaceService.getTemplates().then((result) => {
      if (!cancelled && result.ok) {
        setCustomTemplates(
          Object.entries(result.value).map(([name, content]) => ({ name, content })),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [templatesOpen]);

  const templates = [
    {
      id: "meeting",
      label: "Встреча",
      text: `## Встреча — ${today}\n\n**Участники:** \n**Цель:** \n\n### Повестка\n- \n\n### Решения\n- \n`,
    },
    {
      id: "kb",
      label: "База знаний",
      text: `# Тема\n\n## Обзор\n\n## Ключевые понятия\n\n## Примеры\n\n## Ссылки\n- \n`,
    },
    {
      id: "daily",
      label: "Дневник",
      text: `# Дневник — ${today}\n\n## ✅ Плюсы дня\n- \n\n## ⚠️ Минусы дня\n- \n\n## 💡 Мысли\n- \n`,
    },
  ];

  function apply(transform: (value: string, start: number, end: number) => InsertResult): void {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    const { next, selectionStart, selectionEnd } = transform(value, start, end);
    onChange(next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrap(before: string, after: string, placeholder: string): void {
    apply((val, start, end) => wrapSelection(val, start, end, before, after, placeholder));
  }

  function prefix(prefixText: string): void {
    apply((val, start) => prefixLine(val, start, prefixText));
  }

  function list(ordered: boolean): void {
    apply((val, start, end) => applyList(val, start, end, ordered));
  }

  function insertWikiLink(): void {
    apply((val, start, end) => {
      const next = val.slice(0, start) + "[[]]" + val.slice(end);
      const cursor = start + 2;
      return { next, selectionStart: cursor, selectionEnd: cursor };
    });
  }

  function insertCallout(type: string): void {
    const template = `> [!${type}]\n> `;
    apply((val, start, end) => {
      const next = val.slice(0, start) + template + val.slice(end);
      const cursor = start + template.length;
      return { next, selectionStart: cursor, selectionEnd: cursor };
    });
    setCalloutOpen(false);
  }

  function insertTemplate(text: string): void {
    apply((val, start, end) => {
      const next = val.slice(0, start) + text + val.slice(end);
      const cursor = start + text.length;
      return { next, selectionStart: cursor, selectionEnd: cursor };
    });
    setTemplatesOpen(false);
  }

  function insertTable(): void {
    const rowsRaw = window.prompt("Строк (включая заголовок):", "3");
    if (rowsRaw === null) {
      return;
    }
    const colsRaw = window.prompt("Столбцов:", "3");
    if (colsRaw === null) {
      return;
    }
    const rows = Math.max(1, Math.min(20, Number(rowsRaw) || 3));
    const cols = Math.max(1, Math.min(12, Number(colsRaw) || 3));
    const table = buildTable(rows, cols);
    apply((val, start, end) => {
      const next = val.slice(0, start) + table + val.slice(end);
      const cursor = start + table.length;
      return { next, selectionStart: cursor, selectionEnd: cursor };
    });
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Форматирование Markdown">
      <div className={styles.group}>
        <button type="button" title="Жирный" onClick={() => wrap("**", "**", "текст")}>
          <b>B</b>
        </button>
        <button type="button" title="Курсив" onClick={() => wrap("*", "*", "текст")}>
          <i>I</i>
        </button>
        <button type="button" title="Зачёркнутый" onClick={() => wrap("~~", "~~", "текст")}>
          <s>S</s>
        </button>
      </div>

      <div className={styles.group}>
        <button type="button" title="Заголовок 1" onClick={() => prefix("# ")}>
          H1
        </button>
        <button type="button" title="Заголовок 2" onClick={() => prefix("## ")}>
          H2
        </button>
        <button type="button" title="Заголовок 3" onClick={() => prefix("### ")}>
          H3
        </button>
      </div>

      <div className={styles.group}>
        <button type="button" title="Маркированный список" onClick={() => list(false)}>
          • Список
        </button>
        <button type="button" title="Нумерованный список" onClick={() => list(true)}>
          1. Список
        </button>
      </div>

      <div className={styles.group}>
        <button type="button" title="Цитата" onClick={() => prefix("> ")}>
          &gt; Цитата
        </button>
        <button type="button" title="Блок кода" onClick={() => wrap("\n```\n", "\n```\n", "код")}>
          {"</>"}
        </button>
        {obsidianEnabled ? (
          <div className={`${styles.menuWrap} ${styles.calloutWrap}`}>
            <button
              type="button"
              title="Блок внимания (callout)"
              onClick={() => setCalloutOpen((open) => !open)}
            >
              💡
            </button>
            {calloutOpen ? (
              <div className={styles.dropdownMenu}>
                {[
                  { type: "NOTE", label: "🔵 Note" },
                  { type: "WARNING", label: "🔴 Warning" },
                  { type: "TIP", label: "🟢 Tip" },
                  { type: "IMPORTANT", label: "🟣 Important" },
                ].map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertCallout(option.type);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.group}>
        <button type="button" title="Ссылка" onClick={() => wrap("[", "](https://)", "текст")}>
          🔗 Ссылка
        </button>
        {obsidianEnabled ? (
          <button type="button" title="Внутренняя ссылка [[Название]]" onClick={insertWikiLink}>
            [[ ]] Ссылка
          </button>
        ) : null}
        <button type="button" title="Таблица" onClick={insertTable}>
          📊 Таблица
        </button>
      </div>

      {obsidianEnabled ? (
        <div className={`${styles.group} ${styles.templatesWrap}`}>
          <button ref={templatesBtnRef} type="button" title="Шаблоны" onClick={toggleTemplates}>
            📋 Шаблоны
          </button>
        </div>
      ) : null}

      {obsidianEnabled && templatesOpen && templatesPos
        ? createPortal(
            <div
              className={styles.templatesMenu}
              style={{
                position: "fixed",
                top: templatesPos.top,
                left: templatesPos.left,
                right: "auto",
              }}
            >
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertTemplate(template.text);
                  }}
                >
                  {template.label}
                </button>
              ))}
              {customTemplates.length > 0 ? (
                <div className={styles.menuSeparator}>Мои шаблоны</div>
              ) : null}
              {customTemplates.map((template) => (
                <button
                  key={`custom-${template.name}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertTemplate(template.content);
                  }}
                >
                  {template.name}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
