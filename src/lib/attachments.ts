/** Helper prefix for content-addressed attachment links in Markdown. */
export const ATTACHMENT_SCHEME = "attachment://";

export function isAttachmentUrl(url: string): boolean {
  return url.startsWith(ATTACHMENT_SCHEME);
}

export function shaFromAttachmentUrl(url: string): string {
  return url.slice(ATTACHMENT_SCHEME.length);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /^data:(.*);base64$/.exec(head ?? "")?.[1] ?? "application/octet-stream";
  const binary = atob(body ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** Triggers a local "download" of the attachment (no network involved). */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const blob = dataUrlToBlob(dataUrl);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
