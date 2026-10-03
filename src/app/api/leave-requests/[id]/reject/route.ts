import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toErrorResponse, ok, fail, ApiError } from "@/lib/api";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { rejectPackage } from "@/lib/leave/workflow";

const bodySchema = z.object({
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) {
      throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    }

    const body = bodySchema.parse(await req.json().catch(() => ({})));
    // comment wajib — divalidasi di workflow (AC-009) -> COMMENT_REQUIRED
    const result = await rejectPackage(requestId, user, body.comment);
    const first = Array.isArray(result) ? result[0] : result;

    await auditLog({
      userId: user.id,
      action: "REJECT",
      entityType: "LeaveRequest",
      entityId: requestId,
      newValue: { status: first.status, comment: body.comment },
      ...getRequestMeta(req),
    });

    return ok({ request: first, packageCount: Array.isArray(result) ? result.length : 1 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
