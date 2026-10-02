import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { allocate, getBalance } from "@/lib/leave/balance";

const adjustSchema = z.object({
  employeeId: z.number().int().positive("employeeId wajib diisi"),
  leaveTypeId: z.number().int().positive("leaveTypeId wajib diisi"),
  periodYear: z.number().int().min(2000).max(2100, "Tahun periode tidak valid"),
  days: z.number().refine((n) => n !== 0 && Number.isFinite(n), "Jumlah hari tidak boleh nol"),
  note: z.string().min(3, "Catatan wajib diisi (min. 3 karakter)").max(500),
});

/**
 * POST /api/leave-balances/adjust — penyesuaian saldo manual (ADMIN only).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");

    const body = adjustSchema.parse(await req.json());

    const [employee, leaveType] = await Promise.all([
      db.employee.findUnique({ where: { id: body.employeeId } }),
      db.leaveType.findUnique({ where: { id: body.leaveTypeId } }),
    ]);
    if (!employee) throw new ApiError("NOT_FOUND", "Karyawan tidak ditemukan.", 404);
    if (!leaveType || !leaveType.isActive) {
      throw new ApiError("NOT_FOUND", "Jenis cuti tidak ditemukan atau tidak aktif.", 404);
    }

    const before = await getBalance(body.employeeId, body.leaveTypeId, body.periodYear);
    await allocate(
      body.employeeId,
      body.leaveTypeId,
      body.periodYear,
      body.days,
      body.note,
      user.id,
    );
    const after = await getBalance(body.employeeId, body.leaveTypeId, body.periodYear);

    await auditLog({
      userId: user.id,
      action: "CHANGE_BALANCE",
      entityType: "LeaveBalance",
      entityId: `${body.employeeId}/${body.leaveTypeId}/${body.periodYear}`,
      oldValue: before,
      newValue: { ...after, days: body.days, note: body.note },
      ...getRequestMeta(req),
    });

    return ok({ balance: after });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
