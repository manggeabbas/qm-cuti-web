import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { assertOffManager } from "@/lib/off-approval";
import { validateOffRequest } from "@/lib/scheduling";
import { toISODate } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/off/change-requests/[id]/approve — setujui & terapkan perubahan OFF */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const cr = await db.offChangeRequest.findUnique({ where: { id: Number(id) } });
    if (!cr) return fail("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (cr.status !== "PENDING") return fail("INVALID_STATUS", "Pengajuan sudah diproses.", 400);

    await assertOffManager(user, cr.employeeId);

    if (cr.action === "ADD") {
      const issues = await validateOffRequest(cr.employeeId, cr.date);
      const errors = issues.filter((i) => i.severity === "ERROR");
      if (errors.length > 0) {
        return fail("VALIDATION_FAILED", errors.map((e) => e.message).join(" "), 422);
      }
      await db.offSchedule.upsert({
        where: { employeeId_date: { employeeId: cr.employeeId, date: cr.date } },
        create: { employeeId: cr.employeeId, date: cr.date, kind: "INDIVIDUAL", note: cr.note },
        update: { note: cr.note },
      });
    } else {
      await db.offSchedule.deleteMany({
        where: { employeeId: cr.employeeId, date: cr.date },
      });
    }

    const updated = await db.offChangeRequest.update({
      where: { id: cr.id },
      data: { status: "APPROVED", reviewedBy: user.id, reviewedAt: new Date() },
    });
    await auditLog({
      userId: user.id, action: "APPROVE_OFF_CHANGE", entityType: "OffChangeRequest", entityId: cr.id,
      newValue: { action: cr.action, date: toISODate(cr.date) }, ...getRequestMeta(req),
    });
    return ok(updated);
  } catch (e) {
    return toErrorResponse(e);
  }
}
