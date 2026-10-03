import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function transition(req: Request, ctx: Ctx, to: "PUBLISHED" | "LOCKED", action: string) {
  const user = await requireUser();
  requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
  const { id } = await ctx.params;
  const p = await db.shiftSchedulePeriod.findUnique({ where: { id: Number(id) } });
  if (!p) return fail("NOT_FOUND", "Periode tidak ditemukan.", 404);

  const allowed: Record<string, string[]> = {
    PUBLISHED: ["DRAFT"],
    LOCKED: ["PUBLISHED", "DRAFT"],
  };
  if (!allowed[to].includes(p.status)) {
    return fail("INVALID_STATUS", `Periode berstatus ${p.status}, tidak dapat menjadi ${to}.`, 400);
  }

  const updated = await db.shiftSchedulePeriod.update({
    where: { id: p.id },
    data: { status: to, ...(to === "LOCKED" ? { lockedAt: new Date(), lockedBy: user.id } : {}) },
  });
  await auditLog({
    userId: user.id, action, entityType: "ShiftSchedulePeriod", entityId: p.id,
    oldValue: { status: p.status }, newValue: { status: to }, ...getRequestMeta(req),
  });
  return ok(updated);
}

/** POST /api/shifts/periods/[id]/publish — DRAFT -> PUBLISHED */
export async function POST(req: Request, ctx: Ctx) {
  try {
    return await transition(req, ctx, "PUBLISHED", "PUBLISH_SHIFT_PERIOD");
  } catch (e) {
    return toErrorResponse(e);
  }
}
