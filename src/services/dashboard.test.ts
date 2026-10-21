import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { DashboardService } from "@/services/dashboard";

describe("DashboardService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("getSummary has no arguments", async () => {
    invokeMock.mockResolvedValue({ stats: { totalTasks: 0, inProgress: 0, completedThisWeek: 0 } });
    await DashboardService.getSummary();
    expect(invokeMock).toHaveBeenCalledWith("dashboardSummary", undefined);
  });
});
