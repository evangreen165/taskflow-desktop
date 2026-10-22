import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { NotificationsService } from "@/services/notifications";

describe("NotificationsService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list has no args", async () => {
    invokeMock.mockResolvedValue([]);
    await NotificationsService.list();
    expect(invokeMock).toHaveBeenCalledWith("notificationsList", undefined);
  });

  it("markRead sends the notification id", async () => {
    invokeMock.mockResolvedValue(undefined);
    await NotificationsService.markRead("n1");
    expect(invokeMock).toHaveBeenCalledWith("notificationsMarkRead", { id: "n1" });
  });

  it("markAllRead has no args", async () => {
    invokeMock.mockResolvedValue(undefined);
    await NotificationsService.markAllRead();
    expect(invokeMock).toHaveBeenCalledWith("notificationsMarkAllRead", undefined);
  });
});
