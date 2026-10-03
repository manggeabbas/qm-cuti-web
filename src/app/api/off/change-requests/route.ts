import db from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";

/** GET /api/off/change-requests — daftar pengajuan perubahan OFF */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || "PENDING";

    const isManager = hasRole(user, "ADMIN", "FOREMAN", "WAFOR", "SPV", "WSPV");
    let where: Record<string, unknown> = { status: status as never };

    if (!isManager || !user.employee) {
      // karyawan: hanya milik sendiri
      if (!user.employeeId) return ok({ items: [] });
      where = { ...where, employeeId: user.employeeId };
    } else if (!hasRole(user, "ADMIN")) {
      // manager: scope area tanggung jawab
      const emp = user.employee;
      const scope: Record<string, unknown>[] = [];
      if (hasRole(user, "FOREMAN", "WAFOR")) scope.push({ employee: { teamId: emp.teamId } });
      if (hasRole(user, "SPV")) scope.push({ employee: { departmentId: emp.departmentId } });
      if (hasRole(user, "WSPV")) scope.push({ employee: { divisionId: emp.divisionId } });
      if (scope.length > 0) where = { ...where, OR: scope };
    }

    const rows = await db.offChangeRequest.findMany({
      where: where as never,
      include: {
        employee: {
          select: {
            id: true, name: true, nik: true,
            team: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ items: rows });
  } catch (e) {
    return toErrorResponse(e);
  }
}
