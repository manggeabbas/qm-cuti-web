import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate, toISODate } from "@/lib/dates";

/** GET /api/shifts/rosters?from=&to=&teamId= */
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
    const rosters = await db.shiftRoster.findMany({
      where: { date: { gte: from, lte: to }, ...(teamId ? { teamId } : {}) },
      include: { team: { select: { code: true, name: true } }, shiftType: { select: { code: true, name: true } } },
      orderBy: [{ date: "asc" }, { teamId: "asc" }],
    });
    return ok({
      rosters: rosters.map((r) => ({
        id: r.id, date: toISODate(r.date), team: r.team, shiftType: r.shiftType,
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
    requireRole(user, "ADMIN", "SPV", "FOREMAN", "WAFOR");
    const body = setSchema.parse(await req.json());
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
