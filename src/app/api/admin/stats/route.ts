import db from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { todayUTC, addDays } from "@/lib/dates";

/** GET /api/admin/stats — ringkasan dashboard admin (PRD §41) */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const today = todayUTC();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = addDays(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)), -1);

    const [
      totalEmployee,
      pendingApproval,
      cutiHariIni,
      cutiBulanIni,
      ditolak,
      konflik,
      notifGagal,
    ] = await Promise.all([
      db.employee.count({ where: { status: "ACTIVE" } }),
      db.leaveRequest.count({
        where: { status: { in: ["SUBMITTED", "PENDING_KOORDINATOR", "PENDING_WAFOR", "PENDING_FOREMAN", "PENDING_SPV"] } },
      }),
      db.leaveRequest.count({
        where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      }),
      db.leaveRequest.count({
        where: { status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
      }),
      db.leaveRequest.count({ where: { status: "REJECTED" } }),
      db.leaveRequestConflict.count(),
      db.notification.count({ where: { status: "FAILED" } }),
    ]);

    return ok({ totalEmployee, pendingApproval, cutiHariIni, cutiBulanIni, ditolak, konflik, notifGagal });
  } catch (e) {
    return toErrorResponse(e);
  }
}
