import { requireUser } from "@/lib/auth";
import { toErrorResponse, ok, ApiError } from "@/lib/api";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { submitRequest } from "@/lib/leave/workflow";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) {
      throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    }

    const result = await submitRequest(requestId, user);

    await auditLog({
      userId: user.id,
      action: "SUBMIT_LEAVE_REQUEST",
      entityType: "LeaveRequest",
      entityId: requestId,
      newValue: { status: result.status },
      ...getRequestMeta(req),
    });

    return ok({ request: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
