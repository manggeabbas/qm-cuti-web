import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { parseISODate, toISODate } from "@/lib/dates";

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&teamId=&employeeId=&status=
 * Event cuti (approved + pending), OFF, dan hari libur.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const fromStr = sp.get("from");
    const toStr = sp.get("to");
    if (!fromStr || !toStr) return fail("VALIDATION_ERROR", "Parameter from & to wajib (YYYY-MM-DD).", 422);
    const from = parseISODate(fromStr);
    const to = parseISODate(toStr);
    const teamId = sp.get("teamId") ? Number(sp.get("teamId")) : null;
    const employeeId = sp.get("employeeId") ? Number(sp.get("employeeId")) : null;

    const canSeeNames = hasRole(user, "ADMIN", "SPV", "FOREMAN", "WAFOR", "KOORDINATOR");

    const leaves = await db.leaveRequest.findMany({
      where: {
        startDate: { lte: to },
        endDate: { gte: from },
        status: { in: ["SUBMITTED", "PENDING_KOORDINATOR", "PENDING_WAFOR", "PENDING_FOREMAN", "PENDING_SPV", "APPROVED", "CANCEL_REQUESTED"] },
        ...(teamId ? { employee: { teamId } } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: { employee: { select: { id: true, name: true, team: { select: { code: true, name: true } } } }, leaveType: { select: { name: true, code: true, category: true } } },
      orderBy: { startDate: "asc" },
    });

    const offs = await db.offSchedule.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(teamId ? { employee: { teamId } } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: { employee: { select: { id: true, name: true, team: { select: { code: true } } } } },
    });

    const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: to } } });

    const events = [
      ...leaves.map((l) => {
        const mine = user.employeeId === l.employee.id;
        return {
          id: `leave-${l.id}`,
          title: canSeeNames || mine ? `${l.employee.name} — ${l.leaveType.name}` : `Cuti — ${l.employee.team.name}`,
          start: toISODate(l.startDate),
          end: toISODate(l.endDate),
          kind: "leave" as const,
          status: l.status,
          employeeName: canSeeNames || mine ? l.employee.name : null,
          teamCode: l.employee.team.code,
          leaveType: l.leaveType.name,
        };
      }),
      ...offs.map((o) => ({
        id: `off-${o.id}`,
        title: canSeeNames || user.employeeId === o.employee.id ? `OFF — ${o.employee.name}` : "OFF",
        start: toISODate(o.date),
        end: toISODate(o.date),
        kind: "off" as const,
        status: null as string | null,
        employeeName: canSeeNames ? o.employee.name : null,
        teamCode: o.employee.team.code,
        leaveType: null as string | null,
      })),
      ...holidays.map((h) => ({
        id: `holiday-${h.id}`,
        title: `Libur: ${h.name}`,
        start: toISODate(h.date),
        end: toISODate(h.date),
        kind: "holiday" as const,
        status: null as string | null,
        employeeName: null as string | null,
        teamCode: null as string | null,
        leaveType: null as string | null,
      })),
    ];

    return ok({ events });
  } catch (e) {
    return toErrorResponse(e);
  }
}
