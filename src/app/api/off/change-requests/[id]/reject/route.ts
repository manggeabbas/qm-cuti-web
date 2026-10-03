import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { assertOffManager } from "@/lib/off-approval";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  reviewNote: z.string().trim().min(1, "Alasan penolakan wajib diisi.").max(500),
});

/** POST /api/off/change-requests/[id]/reject — tolak perubahan OFF */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const cr = await db.offChangeRequest.findUnique({ where: { id: Number(id) } });
    if (!cr) return fail("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (cr.status !== "PENDING") return fail("INVALID_STATUS", "Pengajuan sudah diproses.", 400);

    await assertOffManager(user, cr.employeeId);

    const updated = await db.offChangeRequest.update({
      where: { id: cr.id },
      data: { status: "REJECTED", reviewedBy: user.id, reviewNote: body.reviewNote, reviewedAt: new Date() },
    });
    await auditLog({
      userId: user.id, action: "REJECT_OFF_CHANGE", entityType: "OffChangeRequest", entityId: cr.id,
      newValue: { reviewNote: body.reviewNote }, ...getRequestMeta(req),
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}
