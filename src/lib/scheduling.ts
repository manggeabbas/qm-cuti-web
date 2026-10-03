/** Logika bisnis OFF (PRD §22–§23). */
import db from "./db";
import { getNumberSetting } from "./settings";
import { addDays, dayOfWeek, toISODate } from "./dates";
import { getShiftRotationConfig, startOfShiftWeek } from "./shifts";

export interface OffIssue {
  code: string;
  message: string;
  severity: "ERROR" | "WARN";
}

/** Validasi pengajuan OFF individu. */
export async function validateOffRequest(employeeId: number, date: Date): Promise<OffIssue[]> {
  const issues: OffIssue[] = [];
  const dow = dayOfWeek(date);

  // Rabu = OFF bersama, tidak bisa pilih OFF individu
  if (dow === 3) {
    issues.push({ code: "OFF_WEDNESDAY", message: "Rabu adalah OFF bersama, tidak perlu mengajukan OFF individu.", severity: "ERROR" });
    return issues;
  }

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { team: { include: { employees: { where: { status: "ACTIVE" }, select: { id: true } } } } },
  });
  if (!employee) {
    issues.push({ code: "EMPLOYEE_NOT_FOUND", message: "Karyawan tidak ditemukan.", severity: "ERROR" });
    return issues;
  }
  if (employee.status !== "ACTIVE") {
    issues.push({ code: "EMPLOYEE_INACTIVE", message: "Karyawan tidak aktif.", severity: "ERROR" });
    return issues;
  }

  // Maks 1 OFF individu per minggu operasional (mengikuti awal minggu rotasi,
  // default Kamis–Rabu; Rabu sendiri OFF bersama).
  const { weekStartDow } = await getShiftRotationConfig();
  const weekStart = startOfShiftWeek(date, weekStartDow);
  const weekEnd = addDays(weekStart, 6);
  const existing = await db.offSchedule.findFirst({
    where: {
      employeeId,
      kind: "INDIVIDUAL",
      date: { gte: weekStart, lte: weekEnd },
    },
  });
  if (existing) {
    issues.push({
      code: "OFF_WEEK_LIMIT",
      message: `Sudah memiliki OFF individu pada minggu ini (${toISODate(existing.date)}). Maksimal 1x/minggu.`,
      severity: "ERROR",
    });
  }

  // Batas OFF per regu per hari (warning)
  const teamSize = employee.team.employees.length;
  const threshold = await getNumberSetting("TEAM_LARGE_THRESHOLD", 7);
  const limit =
    teamSize >= threshold
      ? await getNumberSetting("TEAM_OFF_LIMIT_LARGE", 2)
      : await getNumberSetting("TEAM_OFF_LIMIT_SMALL", 1);
  const count = await db.offSchedule.count({
    where: {
      date,
      kind: "INDIVIDUAL",
      employee: { teamId: employee.teamId, status: "ACTIVE", id: { not: employeeId } },
    },
  });
  if (count >= limit) {
    issues.push({
      code: "OFF_TEAM_LIMIT",
      message: `Sudah ada ${count} anggota regu yang OFF pada ${toISODate(date)} (batas ${limit} orang/hari).`,
      severity: "WARN",
    });
  }

  return issues;
}
