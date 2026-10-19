import { useEffect, useState, type ReactNode } from "react";

import { isAttachmentUrl, shaFromAttachmentUrl } from "@/lib/attachments";
import { AttachmentsService } from "@/services/attachments";

/**
 * Renders `attachment://` images: fetches the base64 data URL and shows it.
 * Non-attachment images pass through unchanged.
 */
export function AttachmentImage({
  src,
  alt,
}: {
  src?: string | undefined;
  alt?: string | undefined;
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
    return <img src={src} alt={alt ?? ""} />;
  }
  if (!dataUrl) {
    return <span style={{ color: "var(--text-muted)" }}>Загрузка картинки…</span>;
  }
  return <img src={dataUrl} alt={alt ?? ""} />;
}

/**
 * Renders `attachment://` links: clicking opens the stored file with the OS
 * default application (via the `attachmentOpen` command). `preventDefault` is
 * always called so the webview never navigates to the custom protocol.
 */
export function AttachmentLink({
  href,
  children,
}: {
  href?: string | undefined;
  children?: ReactNode;
}): JSX.Element {
  const [busy, setBusy] = useState(false);

  if (!href || !isAttachmentUrl(href)) {
    return <a href={href}>{children}</a>;
  }

  const sha = shaFromAttachmentUrl(href);

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
    <a href={href} onClick={(event) => void handleClick(event)}>
      {busy ? "Открытие…" : children}
    </a>
  );
}
