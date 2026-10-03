import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { dayOfWeek, eachDayOfRange, parseISODate, toISODate } from "@/lib/dates";
import { buildSchedule } from "@/lib/shifts";

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&teamId=&employeeId=&status=
 * Event cuti (approved + pending), OFF mingguan tetap, hari libur, dan shift regu.
 * Jadwal shift dihitung dari pola rotasi sehingga berlaku untuk tanggal mana pun.
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

    const canSeeNames = hasRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN", "WAFOR", "KOORDINATOR");

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

    const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: to } } });

    // OFF mingguan tetap: karyawan dengan offDayOfWeek menghasilkan OFF tiap minggu.
    const offEmployees = await db.employee.findMany({
      where: {
        status: "ACTIVE",
        offDayOfWeek: { not: null },
        ...(teamId ? { teamId } : {}),
        ...(employeeId ? { id: employeeId } : {}),
        ...(canSeeNames ? {} : { id: user.employee?.id ?? -1 }),
      },
      select: { id: true, name: true, offDayOfWeek: true, team: { select: { code: true } } },
    });
    const offEvents: Array<Record<string, unknown>> = [];
    for (const e of offEmployees) {
      if (e.offDayOfWeek == null) continue;
      for (const d of eachDayOfRange(from, to)) {
        if (dayOfWeek(d) !== e.offDayOfWeek) continue;
        const mine = user.employeeId === e.id;
        offEvents.push({
          id: `off-${e.id}-${toISODate(d)}`,
          title: canSeeNames || mine ? `OFF — ${e.name}` : "OFF",
          start: toISODate(d),
          end: toISODate(d),
          kind: "off",
          status: null,
          employeeName: canSeeNames || mine ? e.name : null,
          teamCode: e.team.code,
          leaveType: null,
        });
      }
    }

    // Shift: karyawan hanya melihat regunya sendiri; approver/admin melihat semua
    // atau difilter dengan teamId. Dihitung dari pola rotasi (berlaku selamanya).
    let shiftTeamFilter: number | undefined;
    if (teamId) shiftTeamFilter = teamId;
    else if (!canSeeNames) shiftTeamFilter = user.employee?.teamId ?? -1;

    const shifts = shiftTeamFilter === -1 ? [] : await buildSchedule(from, to, shiftTeamFilter);

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
      ...offEvents.map((o) => ({ ...o, kind: "off" as const })),
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
      ...shifts.map((s) => {
        const isMine = user.employee?.teamId === s.team.id;
        const showTeam = canSeeNames && !isMine;
        const hours = ` ${s.shiftType.startTime}–${s.shiftType.endTime}`;
        return {
          id: `shift-${s.team.code}-${s.date}`,
          title: `${s.shiftType.name}${hours}${showTeam ? ` · ${s.team.name}` : ""}`,
          start: s.date,
          end: s.date,
          kind: "shift" as const,
          status: null as string | null,
          employeeName: null as string | null,
          teamCode: s.team.code,
          leaveType: null as string | null,
          shiftCode: s.shiftType.code,
          startTime: s.shiftType.startTime,
          endTime: s.shiftType.endTime,
        };
      }),
    ];

    return ok({ events });
  } catch (e) {
    return toErrorResponse(e);
  }
}
