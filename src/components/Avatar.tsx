import { useEffect, useState } from "react";

import { AttachmentsService } from "@/services/attachments";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function loadAvatar(sha256: string): Promise<string | null> {
  const cached = cache.get(sha256);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(sha256);
  if (pending) {
    return pending;
  }
  const promise = AttachmentsService.getBase64(sha256)
    .then((result) => {
      if (result.ok) {
        cache.set(sha256, result.value);
        return result.value;
      }
      return null;
    })
    .finally(() => {
      inflight.delete(sha256);
    });
  inflight.set(sha256, promise);
  return promise;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase();
}

/** Rounds a user avatar: photo from the attachment store, or initials circle. */
export default function Avatar({
  name,
  color,
  sha256,
  size = 28,
}: {
  name: string;
  color: string;
  sha256?: string | null | undefined;
  size?: number;
}): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sha256) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void loadAvatar(sha256).then((url) => {
      if (!cancelled && url) {
        setDataUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sha256]);

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        width={size}
        height={size}
        alt=""
        style={{
          borderRadius: "50%",
          objectFit: "cover",
          background: color,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 600,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
