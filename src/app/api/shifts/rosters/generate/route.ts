import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { generateRoster } from "@/lib/scheduling";
import { parseISODate } from "@/lib/dates";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** POST /api/shifts/rosters/generate {from, to} — generate rotasi otomatis */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const body = schema.parse(await req.json());
    const from = parseISODate(body.from);
    const to = parseISODate(body.to);
    // tolak bila ada periode terkunci yang beririsan dengan rentang
    const locked = await db.shiftSchedulePeriod.findFirst({
      where: { status: "LOCKED", from: { lte: to }, to: { gte: from } },
      select: { id: true, name: true },
    });
    if (locked) {
      return fail("SCHEDULE_LOCKED", `Rentang beririsan dengan periode terkunci "${locked.name}".`, 403);
    }
    const result = await generateRoster(from, to);
    await auditLog({ userId: user.id, action: "GENERATE_SHIFT_ROSTER", entityType: "ShiftRoster", newValue: { ...body, ...result }, ...getRequestMeta(req) });
    return ok(result);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid", 422);
    return toErrorResponse(e);
  }
}
