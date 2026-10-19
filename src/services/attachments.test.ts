import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { AttachmentsService } from "@/services/attachments";

describe("AttachmentsService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("add maps sourcePath and name", async () => {
    invokeMock.mockResolvedValue({ info: { sha256: "a".repeat(64) }, created: true });
    await AttachmentsService.add("C:/Users/x/photo.png", "photo.png");
    expect(invokeMock).toHaveBeenCalledWith("attachmentAdd", {
      sourcePath: "C:/Users/x/photo.png",
      name: "photo.png",
    });
  });

  it("getBase64 sends the sha256", async () => {
    invokeMock.mockResolvedValue("data:image/png;base64,AAA");
    await AttachmentsService.getBase64("abc");
    expect(invokeMock).toHaveBeenCalledWith("attachmentGetBase64", { sha256: "abc" });
  });

  it("remove sends the sha256", async () => {
    invokeMock.mockResolvedValue(undefined);
    await AttachmentsService.remove("abc");
    expect(invokeMock).toHaveBeenCalledWith("attachmentRemove", { sha256: "abc" });
  });

  it("open sends the sha256", async () => {
    invokeMock.mockResolvedValue(undefined);
    await AttachmentsService.open("abc");
    expect(invokeMock).toHaveBeenCalledWith("attachmentOpen", { sha256: "abc" });
  });
});
