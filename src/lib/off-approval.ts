/** Otorisasi approval perubahan OFF (PRD §22.2): Wafor/Foreman/WSPV/SPV/Admin sesuai scope. */
import db from "./db";
import { ApiError } from "./api";
import type { SessionUser } from "./auth";
import { hasRole } from "./role-utils";

export async function assertOffManager(user: SessionUser, targetEmployeeId: number): Promise<void> {
  if (hasRole(user, "ADMIN")) return;
  const emp = user.employee;
  if (!emp) throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
  const target = await db.employee.findUnique({
    where: { id: targetEmployeeId },
    select: { teamId: true, departmentId: true, divisionId: true },
  });
  if (!target) throw new ApiError("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

  if (hasRole(user, "FOREMAN", "WAFOR") && emp.teamId === target.teamId) return;
  if (hasRole(user, "SPV") && emp.departmentId === target.departmentId) return;
  if (hasRole(user, "WSPV") && emp.divisionId === target.divisionId) return;
  throw new ApiError("FORBIDDEN", "Anda tidak memiliki wewenang atas pengajuan ini.", 403);
}
