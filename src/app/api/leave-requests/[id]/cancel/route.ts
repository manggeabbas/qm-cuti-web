import db from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toErrorResponse, ok, ApiError } from "@/lib/api";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { requestCancel, confirmCancel } from "@/lib/leave/workflow";

/**
 * POST /api/leave-requests/[id]/cancel
 * - Pemohon (atau admin): status berjalan/disujui -> requestCancel (CANCEL_REQUESTED).
 * - Approver/admin saat status CANCEL_REQUESTED -> confirmCancel (CANCELLED + refund bila perlu).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) {
      throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    }

    const existing = await db.leaveRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, employeeId: true },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);

    let result;
    let via: string;
    if (existing.status === "CANCEL_REQUESTED") {
      result = await confirmCancel(requestId, user);
      via = "confirm";
    } else {
      result = await requestCancel(requestId, user);
      via = "request";
    }

    await auditLog({
      userId: user.id,
      action: "CANCEL",
      entityType: "LeaveRequest",
      entityId: requestId,
      newValue: { status: result.status, via },
      ...getRequestMeta(req),
    });

    return ok({ request: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
