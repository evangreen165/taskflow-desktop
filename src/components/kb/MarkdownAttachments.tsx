import { useEffect, useState, type ReactNode } from "react";

import { isAttachmentUrl, shaFromAttachmentUrl } from "@/lib/attachments";
import { AttachmentsService } from "@/services/attachments";
import { SystemService } from "@/services/system";

/**
 * Renders `attachment://` images: fetches the base64 data URL and shows it.
 * Non-attachment images pass through unchanged. An optional `onImageClick`
 * lets the editor open a resize toolbar.
 */
export function AttachmentImage({
  src,
  alt,
  width,
  onImageClick,
}: {
  src?: string | undefined;
  alt?: string | undefined;
  width?: string | number | undefined;
  onImageClick?: (sha: string, alt: string, rect: DOMRect) => void;
}): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src || !isAttachmentUrl(src)) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void AttachmentsService.getBase64(shaFromAttachmentUrl(src)).then((result) => {
      if (!cancelled && result.ok) {
        setDataUrl(result.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src || !isAttachmentUrl(src)) {
    return <img src={src} alt={alt ?? ""} width={width} />;
  }
  const sha = shaFromAttachmentUrl(src);
  if (!dataUrl) {
    return <span style={{ color: "var(--text-muted)" }}>Загрузка картинки…</span>;
  }
  return (
    <img
      src={dataUrl}
      alt={alt ?? ""}
      width={width}
      onClick={(event) => onImageClick?.(sha, alt ?? "", event.currentTarget.getBoundingClientRect())}
    />
  );
}

/**
 * Renders links. `attachment://` opens the stored file with the OS default app;
 * `http(s)` URLs open in the default browser and local file/folder paths open
 * in the OS file explorer. Every non-anchor link calls `preventDefault` so the
 * webview never navigates away (which used to freeze the app).
 */
export function AttachmentLink({
  href,
  children,
}: {
  href?: string | undefined;
  children?: ReactNode;
}): JSX.Element {
  const [busy, setBusy] = useState(false);

  if (!href) {
    return <a>{children}</a>;
  }

  // In-page anchors stay native.
  if (href.startsWith("#")) {
    return <a href={href}>{children}</a>;
  }

  if (!isAttachmentUrl(href)) {
    async function handleExternal(event: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
      event.preventDefault();
      if (busy) {
        return;
      }
      setBusy(true);
      await SystemService.openExternal(href ?? "");
      setBusy(false);
    }
    return (
      <a href={href} title="Открыть ссылку" onClick={(event) => void handleExternal(event)}>
        {children}
      </a>
    );
  }

  const sha = shaFromAttachmentUrl(href);
  const label = typeof children === "string" ? children : "";

  // PDF attachments render inline so the user can scroll through them.
  if (label.toLowerCase().endsWith(".pdf")) {
    return <PdfAttachment sha={sha} label={label} />;
  }

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    await AttachmentsService.open(sha);
    setBusy(false);
  }

  return (
    <a
      href={href}
      title={busy ? undefined : "Открыть файл"}
      onClick={(event) => void handleClick(event)}
    >
      {busy ? "Открытие…" : <>📄 {children}</>}
    </a>
  );
}

/** Inline PDF viewer backed by the `attachmentGetBase64` data URL. */
function PdfAttachment({ sha, label }: { sha: string; label: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AttachmentsService.getBase64(sha).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setDataUrl(result.value);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sha]);

  return (
    <div style={{ margin: "12px 0" }}>
      {dataUrl ? (
        <object
          data={dataUrl}
          type="application/pdf"
          style={{
            width: "100%",
            height: 600,
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Не удалось показать PDF встроенно.
          </p>
        </object>
      ) : failed ? (
        <span style={{ color: "var(--text-muted)" }}>Не удалось загрузить PDF.</span>
      ) : (
        <span style={{ color: "var(--text-muted)" }}>Загрузка PDF…</span>
      )}
      <div style={{ marginTop: 6 }}>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            void AttachmentsService.open(sha);
          }}
        >
          📄 {label}
        </a>
      </div>
    </div>
  );
}
