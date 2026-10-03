import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { assertPeriodEditable } from "@/lib/shift-periods";
import { buildSchedule } from "@/lib/shifts";
import { parseISODate, toISODate } from "@/lib/dates";
import { z } from "zod";
import db from "@/lib/db";

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

const setSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.number().int(),
  shiftTypeId: z.number().int(),
});

/** POST /api/shifts/rosters — set manual (foreman/spv/admin) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN", "WAFOR");
    const body = setSchema.parse(await req.json());
    // tolak bila roster existing berada pada periode yang terkunci
    const existing = await db.shiftRoster.findUnique({
      where: { date_teamId: { date: parseISODate(body.date), teamId: body.teamId } },
      select: { periodId: true },
    });
    await assertPeriodEditable(existing?.periodId ?? null);
    const row = await db.shiftRoster.upsert({
      where: { date_teamId: { date: parseISODate(body.date), teamId: body.teamId } },
      create: { date: parseISODate(body.date), teamId: body.teamId, shiftTypeId: body.shiftTypeId },
      update: { shiftTypeId: body.shiftTypeId },
    });
    await auditLog({ userId: user.id, action: "SET_SHIFT_ROSTER", entityType: "ShiftRoster", entityId: row.id, newValue: body, ...getRequestMeta(req) });
    return ok({ roster: row });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid", 422);
    return toErrorResponse(e);
  }
}
