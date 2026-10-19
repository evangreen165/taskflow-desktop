import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";

export interface AttachmentInfo {
  sha256: string;
  name: string;
  mime: string;
  size: number;
  ext: string;
}

export interface AttachmentResult {
  info: AttachmentInfo;
  created: boolean;
}

export const AttachmentsService = {
  /** Copies an absolute local path into the content-addressed store. */
  add(sourcePath: string, name: string): Promise<Result<AttachmentResult>> {
    return invokeCommand<AttachmentResult>("attachmentAdd", { sourcePath, name });
  },

  /** Returns the attachment as a `data:<mime>;base64,…` URL. */
  getBase64(sha256: string): Promise<Result<string>> {
    return invokeCommand<string>("attachmentGetBase64", { sha256 });
  },

  remove(sha256: string): Promise<Result<void>> {
    return invokeCommand<void>("attachmentRemove", { sha256 });
  },

  /** Opens the stored file with the OS default application. */
  open(sha256: string): Promise<Result<void>> {
    return invokeCommand<void>("attachmentOpen", { sha256 });
  },
};
