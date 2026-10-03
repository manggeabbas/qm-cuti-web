import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ locked: z.boolean() });

/**
 * POST /api/employees/[id]/off-lock — kunci/buka OFF karyawan.
 * Setelah dikunci, perubahan OFF karyawan memerlukan persetujuan (PRD §22.2).
 * Oleh: ADMIN / SPV / WSPV / FOREMAN / WAFOR sesuai scope.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const empId = Number(id);
    const body = schema.parse(await req.json());

    const target = await db.employee.findUnique({
      where: { id: empId },
      select: { id: true, teamId: true, departmentId: true, divisionId: true, offLocked: true, name: true },
    });
    if (!target) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

    const emp = user.employee;
    const allowed =
      hasRole(user, "ADMIN") ||
      (hasRole(user, "FOREMAN", "WAFOR") && emp?.teamId === target.teamId) ||
      (hasRole(user, "SPV") && emp?.departmentId === target.departmentId) ||
      (hasRole(user, "WSPV") && emp?.divisionId === target.divisionId);
    if (!allowed) return fail("FORBIDDEN", "Anda tidak memiliki wewenang.", 403);

    const updated = await db.employee.update({
      where: { id: empId },
      data: { offLocked: body.locked },
      select: { id: true, offLocked: true },
    });
    await auditLog({
      userId: user.id,
      action: body.locked ? "LOCK_EMPLOYEE_OFF" : "UNLOCK_EMPLOYEE_OFF",
      entityType: "Employee",
      entityId: empId,
      oldValue: { offLocked: target.offLocked },
      newValue: { offLocked: body.locked },
      ...getRequestMeta(req),
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}
