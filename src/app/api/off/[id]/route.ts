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
    const isManager = hasRole(user, "ADMIN", "FOREMAN", "WAFOR", "SPV", "WSPV");
    const isSelf = user.employeeId === row.employeeId;
    const canDelete = isManager || isSelf;
    if (!canDelete) throw new ApiError("FORBIDDEN", "Anda tidak boleh menghapus jadwal ini.", 403);
    if (row.kind === "COLLECTIVE") throw new ApiError("FORBIDDEN", "OFF bersama tidak dapat dihapus.", 403);

    // Karyawan yang OFF-nya dikunci: hapus menjadi change request (PRD §22.2)
    if (!isManager && isSelf) {
      const emp = await db.employee.findUnique({ where: { id: row.employeeId }, select: { offLocked: true } });
      if (emp?.offLocked) {
        const dup = await db.offChangeRequest.findFirst({
          where: { employeeId: row.employeeId, date: row.date, status: "PENDING" },
        });
        if (dup) throw new ApiError("DUPLICATE", "Sudah ada pengajuan perubahan untuk tanggal ini.", 409);
        const cr = await db.offChangeRequest.create({
          data: { employeeId: row.employeeId, action: "REMOVE", date: row.date, requestedBy: user.id },
        });
        await auditLog({ userId: user.id, action: "REQUEST_OFF_CHANGE", entityType: "OffChangeRequest", entityId: cr.id, newValue: { action: "REMOVE" }, ...getRequestMeta(req) });
        return ok({ changeRequest: cr, pendingApproval: true });
      }
    }

    await db.offSchedule.delete({ where: { id: row.id } });
    await auditLog({ userId: user.id, action: "DELETE_OFF", entityType: "OffSchedule", entityId: row.id, oldValue: row, ...getRequestMeta(req) });
    return ok({ message: "Jadwal OFF dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
