/** Logika bisnis OFF (PRD §22–§23). */
import db from "./db";
import { getNumberSetting } from "./settings";
import { addDays, dayOfWeek, startOfWeekMonday, toISODate } from "./dates";

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

  // Maks 1 OFF individu per minggu (Senin–Minggu)
  const weekStart = startOfWeekMonday(date);
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

/** Generate roster shift rotasi 3 regu x 3 shift untuk rentang tanggal (Rabu dilewati = OFF bersama). */
export async function generateRoster(from: Date, to: Date, periodId?: number): Promise<{ created: number; skipped: number }> {
  const teams = await db.team.findMany({
    where: { isActive: true, code: { in: ["REGU_A", "REGU_B", "REGU_C"] } },
    orderBy: { code: "asc" },
  });
  const shifts = await db.shiftType.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  // Urutan rotasi: PAGI, SORE, MALAM
  const order = ["PAGI", "SORE", "MALAM"]
    .map((c) => shifts.find((s) => s.code === c))
    .filter((s): s is (typeof shifts)[number] => !!s);
  if (teams.length === 0 || order.length === 0) throw new Error("Data regu/shift belum lengkap.");

  let created = 0;
  let skipped = 0;
  let dayIndex = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    if (dayOfWeek(d) === 3) {
      dayIndex++;
      continue; // Rabu: OFF bersama
    }
    for (let t = 0; t < teams.length; t++) {
      const shift = order[(dayIndex + t) % order.length];
      const res = await db.shiftRoster.upsert({
        where: { date_teamId: { date: d, teamId: teams[t].id } },
        create: { date: d, teamId: teams[t].id, shiftTypeId: shift.id, ...(periodId ? { periodId } : {}) },
        update: { shiftTypeId: shift.id, ...(periodId ? { periodId } : {}) },
      });
      void res;
      created++;
    }
    dayIndex++;
    void skipped;
  }
  return { created, skipped: 0 };
}

/**
 * Generate roster untuk satu periode dari template rotasi (PRD §20A.4).
 * - periodLengthDays: durasi tiap urutan periode dalam hari (default 7).
 * - startPeriodOrder: urutan periode awal siklus.
 * - Rabu dilewati (OFF bersama), konsisten dengan generateRoster().
 * Roster yang dibuat terhubung ke periodId.
 */
export async function generateRosterForPeriod(
  periodId: number,
  from: Date,
  to: Date,
  templateId: number,
  periodLengthDays = 7,
  startPeriodOrder = 1,
): Promise<{ created: number }> {
  const template = await db.shiftRotationTemplate.findUnique({
    where: { id: templateId },
    include: { items: true },
  });
  if (!template || !template.isActive) throw new Error("Template tidak ditemukan / tidak aktif.");
  if (template.items.length === 0) throw new Error("Template belum memiliki item rotasi.");

  const numPeriods = Math.max(...template.items.map((i) => i.periodOrder));
  const byKey = new Map<string, number>();
  for (const it of template.items) byKey.set(`${it.periodOrder}:${it.teamId}`, it.shiftTypeId);

  const teamIds = [...new Set(template.items.map((i) => i.teamId))];

  let created = 0;
  let dayIdx = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    if (dayOfWeek(d) === 3) {
      dayIdx++;
      continue; // Rabu: OFF bersama
    }
    const periodOrder = ((startPeriodOrder - 1 + Math.floor(dayIdx / periodLengthDays)) % numPeriods) + 1;
    for (const teamId of teamIds) {
      const shiftTypeId = byKey.get(`${periodOrder}:${teamId}`);
      if (!shiftTypeId) continue;
      await db.shiftRoster.upsert({
        where: { date_teamId: { date: d, teamId } },
        create: { date: d, teamId, shiftTypeId, periodId },
        update: { shiftTypeId, periodId },
      });
      created++;
    }
    dayIdx++;
  }
  return { created };
}
