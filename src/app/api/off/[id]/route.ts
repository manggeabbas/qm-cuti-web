import db from "@/lib/db";
import { ok, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { auditLog, getRequestMeta } from "@/lib/audit";

/** DELETE /api/off/[id] — hapus OFF individu */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const row = await db.offSchedule.findUnique({ where: { id: Number(id) } });
    if (!row) throw new ApiError("NOT_FOUND", "Jadwal OFF tidak ditemukan.", 404);
    const canDelete =
      hasRole(user, "ADMIN", "FOREMAN", "WAFOR", "SPV") || user.employeeId === row.employeeId;
    if (!canDelete) throw new ApiError("FORBIDDEN", "Anda tidak boleh menghapus jadwal ini.", 403);
    if (row.kind === "COLLECTIVE") throw new ApiError("FORBIDDEN", "OFF bersama tidak dapat dihapus.", 403);
    await db.offSchedule.delete({ where: { id: row.id } });
    await auditLog({ userId: user.id, action: "DELETE_OFF", entityType: "OffSchedule", entityId: row.id, oldValue: row, ...getRequestMeta(req) });
    return ok({ message: "Jadwal OFF dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
