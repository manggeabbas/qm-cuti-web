import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/shifts/periods/[id]/lock — PUBLISHED/DRAFT -> LOCKED */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const { id } = await ctx.params;
    const p = await db.shiftSchedulePeriod.findUnique({ where: { id: Number(id) } });
    if (!p) return fail("NOT_FOUND", "Periode tidak ditemukan.", 404);
    if (p.status === "LOCKED") return fail("INVALID_STATUS", "Periode sudah terkunci.", 400);

    const updated = await db.shiftSchedulePeriod.update({
      where: { id: p.id },
      data: { status: "LOCKED", lockedAt: new Date(), lockedBy: user.id },
    });
    await auditLog({
      userId: user.id, action: "LOCK_SHIFT_PERIOD", entityType: "ShiftSchedulePeriod", entityId: p.id,
      oldValue: { status: p.status }, newValue: { status: "LOCKED" }, ...getRequestMeta(req),
    });
    return ok(updated);
  } catch (e) {
    return toErrorResponse(e);
  }
}
