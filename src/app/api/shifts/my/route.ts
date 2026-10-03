import db from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildSchedule, getShiftRotationConfig, shiftWeekRange } from "@/lib/shifts";
import { parseISODate, toISODate, todayUTC } from "@/lib/dates";

/**
 * GET /api/shifts/my?from=&to=
 * Jadwal shift regu karyawan yang login (default: minggu rotasi berjalan).
 * Dihitung dari pola rotasi sehingga berlaku untuk tanggal mana pun.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const today = todayUTC();
    if (!user.employee) {
      return ok({ team: null, from: null, to: null, today: toISODate(today), items: [] });
    }

    const sp = new URL(req.url).searchParams;
    const config = await getShiftRotationConfig();
    const week = shiftWeekRange(today, config);
    const from = sp.get("from") ? parseISODate(sp.get("from") as string) : week.from;
    const to = sp.get("to") ? parseISODate(sp.get("to") as string) : week.to;

    const [team, schedule] = await Promise.all([
      db.team.findUnique({
        where: { id: user.employee.teamId },
        select: { id: true, code: true, name: true },
      }),
      buildSchedule(from, to, user.employee.teamId),
    ]);

    return ok({
      team,
      from: toISODate(from),
      to: toISODate(to),
      today: toISODate(today),
      items: schedule.map((s) => ({
        date: s.date,
        shift: {
          code: s.shiftType.code,
          name: s.shiftType.name,
          startTime: s.shiftType.startTime,
          endTime: s.shiftType.endTime,
        },
      })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
