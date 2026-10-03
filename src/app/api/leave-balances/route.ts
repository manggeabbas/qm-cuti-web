import db from "@/lib/db";
import { ok, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { getBalance } from "@/lib/leave/balance";
import type { SessionUser } from "@/lib/auth";

/** Tahun berjalan menurut zona Asia/Makassar. */
function currentYearWITA(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", year: "numeric" }).format(new Date()),
  );
}

/** Otorisasi lihat saldo: milik sendiri / approver area / admin. */
function assertBalanceAccess(user: SessionUser, target: {
  id: number;
  teamId: number;
  sectionId: number;
  departmentId: number;
  divisionId: number;
}): void {
  if (hasRole(user, "ADMIN")) return;
  if (user.employeeId != null && user.employeeId === target.id) return;
  const emp = user.employee;
  if (!emp) {
    throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
  }
  if (hasRole(user, "FOREMAN", "WAFOR") && emp.teamId === target.teamId) return;
  if (hasRole(user, "KOORDINATOR") && emp.sectionId === target.sectionId) return;
  if (hasRole(user, "SPV") && emp.departmentId === target.departmentId) return;
  if (hasRole(user, "WSPV") && emp.divisionId === target.divisionId) return;
  throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses ke saldo karyawan ini.", 403);
}

/**
 * GET /api/leave-balances?employeeId=&year=
 * Untuk tiap jenis cuti aktif: { leaveType, allocated, used, pending, available }.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;

    const employeeIdParam = sp.get("employeeId");
    const employeeId = employeeIdParam ? Number(employeeIdParam) : (user.employeeId ?? null);
    if (employeeId == null || !Number.isInteger(employeeId)) {
      throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
    }

    const yearParam = sp.get("year");
    const year = yearParam ? Number(yearParam) : currentYearWITA();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ApiError("INVALID_FILTER", "Parameter year tidak valid.", 422);
    }

    const target = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, nik: true, teamId: true, sectionId: true, departmentId: true, divisionId: true },
    });
    if (!target) throw new ApiError("NOT_FOUND", "Karyawan tidak ditemukan.", 404);
    assertBalanceAccess(user, target);

    const types = await db.leaveType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const balances = await Promise.all(
      types.map(async (t) => ({
        leaveType: {
          id: t.id,
          code: t.code,
          name: t.name,
          category: t.category,
          consumesBalance: t.consumesBalance,
        },
        ...(await getBalance(employeeId, t.id, year)),
      })),
    );

    return ok({
      employee: { id: target.id, name: target.name, nik: target.nik },
      year,
      balances,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
