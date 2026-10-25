import type { RefObject } from "react";

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
    </div>
  );
}
