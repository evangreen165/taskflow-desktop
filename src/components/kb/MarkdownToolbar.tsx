import type { RefObject } from "react";

import styles from "./MarkdownToolbar.module.css";

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
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
    return { next, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
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

const TABLE_TEMPLATE = `| Заголовок 1 | Заголовок 2 | Заголовок 3 |
| --- | --- | --- |
|  |  |  |
|  |  |  |`;

export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
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
        <button type="button" title="Маркированный список" onClick={() => prefix("- ")}>
          • Список
        </button>
        <button type="button" title="Нумерованный список" onClick={() => prefix("1. ")}>
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
        <button
          type="button"
          title="Таблица 3×3"
          onClick={() => apply((val, start, end) => {
            const next = val.slice(0, start) + TABLE_TEMPLATE + val.slice(end);
            const cursor = start + TABLE_TEMPLATE.length;
            return { next, selectionStart: cursor, selectionEnd: cursor };
          })}
        >
          📊 Таблица
        </button>
      </div>
    </div>
  );
}
