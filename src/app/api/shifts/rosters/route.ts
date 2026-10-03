import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildSchedule } from "@/lib/shifts";
import { parseISODate } from "@/lib/dates";

/**
 * GET /api/shifts/rosters?from=&to=&teamId=
 * Jadwal shift regu dihitung dari pola rotasi (berlaku untuk tanggal mana pun).
 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const fromStr = sp.get("from");
    const toStr = sp.get("to");
    if (!fromStr || !toStr) return fail("VALIDATION_ERROR", "Parameter from & to wajib.", 422);
    const from = parseISODate(fromStr);
    const to = parseISODate(toStr);
    const teamId = sp.get("teamId") ? Number(sp.get("teamId")) : undefined;

    const schedule = await buildSchedule(from, to, teamId);
    return ok({
      rosters: schedule.map((s) => ({
        id: `${s.team.code}-${s.date}`,
        date: s.date,
        team: { id: s.team.id, code: s.team.code, name: s.team.name },
        shiftType: {
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
