import type { Result } from "@/lib/errors";
import { invokeCommand } from "@/lib/invoke";
import type { AuditLogPage } from "@/services/types";

export const AuditService = {
  /**
   * Reads the workspace audit journal (newest first, paginated).
   * `userFilter` matches the actor's login, `actionFilter` is exact,
   * `dateFilter` is `YYYY-MM` or `YYYY-MM-DD`.
   */
  getLogs(
    limit: number,
    offset: number,
    userFilter: string,
    actionFilter: string,
    dateFilter: string,
  ): Promise<Result<AuditLogPage>> {
    return invokeCommand<AuditLogPage>("auditGetLogs", {
      limit,
      offset,
      userFilter: userFilter.trim() || null,
      actionFilter: actionFilter.trim() || null,
      dateFilter: dateFilter.trim() || null,
    });
  },
};
