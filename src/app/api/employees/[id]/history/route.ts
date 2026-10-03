import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { toISODate } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/employees/[id]/history — riwayat perubahan karyawan (PRD §1A.14) */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN", "WAFOR", "KOORDINATOR");
    const { id } = await ctx.params;
    const empId = Number(id);
    const emp = await db.employee.findUnique({ where: { id: empId }, select: { id: true } });
    if (!emp) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

    const rows = await db.employeeHistory.findMany({
      where: { employeeId: empId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // nama pengubah
    const changerIds = [...new Set(rows.map((r) => r.changedBy).filter((x): x is number => x != null))];
    const changers = changerIds.length
      ? await db.user.findMany({ where: { id: { in: changerIds } }, select: { id: true, username: true } })
      : [];
    const changerMap = new Map(changers.map((c) => [c.id, c.username]));

    return ok({
      items: rows.map((r) => ({
        id: r.id,
        field: r.field,
        fieldLabel: r.fieldLabel,
        oldLabel: r.oldLabel,
        newLabel: r.newLabel,
        effectiveDate: r.effectiveDate ? toISODate(r.effectiveDate) : null,
        changedBy: r.changedBy ? (changerMap.get(r.changedBy) ?? `#${r.changedBy}`) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
