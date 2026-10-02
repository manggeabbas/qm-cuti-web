import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { parseISODate } from "@/lib/dates";
import {
  buildLeaveReport,
  buildBalanceReport,
  buildApprovalReport,
  buildConflictReport,
  type ReportTable,
} from "@/lib/reports/builders";
import { toXlsxBuffer, toCsvString, toPdfBuffer, downloadResponse } from "@/lib/reports/export";

/**
 * GET /api/reports/[type]?format=xlsx|csv|pdf|json
 * type: leave | balance | approval | conflict
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV");
    const { type } = await params;
    const sp = new URL(req.url).searchParams;
    const format = (sp.get("format") ?? "json").toLowerCase();

    let table: ReportTable;
    const from = sp.get("from") ? parseISODate(sp.get("from") as string) : undefined;
    const to = sp.get("to") ? parseISODate(sp.get("to") as string) : undefined;

    if (type === "leave") {
      table = await buildLeaveReport({
        from, to,
        teamId: sp.get("teamId") ? Number(sp.get("teamId")) : undefined,
        sectionId: sp.get("sectionId") ? Number(sp.get("sectionId")) : undefined,
        positionId: sp.get("positionId") ? Number(sp.get("positionId")) : undefined,
        employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
        leaveTypeId: sp.get("leaveTypeId") ? Number(sp.get("leaveTypeId")) : undefined,
        status: sp.get("status") ?? undefined,
      });
    } else if (type === "balance") {
      const year = sp.get("year") ? Number(sp.get("year")) : new Date().getUTCFullYear();
      table = await buildBalanceReport(year, sp.get("teamId") ? Number(sp.get("teamId")) : undefined);
    } else if (type === "approval") {
      table = await buildApprovalReport(from, to);
    } else if (type === "conflict") {
      table = await buildConflictReport(from, to);
    } else {
      return fail("NOT_FOUND", "Jenis laporan tidak dikenal.", 404);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "xlsx") {
      return downloadResponse(toXlsxBuffer(table), `laporan-${type}-${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    if (format === "csv") {
      return downloadResponse(toCsvString(table), `laporan-${type}-${stamp}.csv`, "text/csv; charset=utf-8");
    }
    if (format === "pdf") {
      return downloadResponse(await toPdfBuffer(table), `laporan-${type}-${stamp}.pdf`, "application/pdf");
    }
    return ok({ title: table.title, columns: table.columns, rows: table.rows, count: table.rows.length });
  } catch (e) {
    return toErrorResponse(e);
  }
}
