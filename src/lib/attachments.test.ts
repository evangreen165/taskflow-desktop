import { describe, expect, it } from "vitest";

import { dataUrlToBlob, isAttachmentUrl, shaFromAttachmentUrl } from "@/lib/attachments";

describe("isAttachmentUrl / shaFromAttachmentUrl", () => {
  it("detects the scheme and extracts the hash", () => {
    expect(isAttachmentUrl("attachment://abc123")).toBe(true);
    expect(isAttachmentUrl("https://example.com/a.png")).toBe(false);
    expect(shaFromAttachmentUrl("attachment://abc123")).toBe("abc123");
  });
});

describe("dataUrlToBlob", () => {
  it("decodes base64 into a blob with the right mime and bytes", () => {
    const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(5);
    expect(dataUrlToBlob("data:text/plain;base64,YQ==").type).toBe("text/plain");
  });
});
