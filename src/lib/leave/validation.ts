/**
 * LeaveValidationService — SATU-SATUNYA tempat business rule cuti/izin.
 * (PRD §53: aturan tidak boleh tersebar di komponen UI.)
 *
 * Fungsi murni `validateLeaveRequest(input)` tidak menyentuh DB sehingga
 * mudah di-unit-test. Loader `buildValidationInput()` menyiapkan input
 * dari database untuk dipakai API.
 */
import db from "../db";
import { getNumberSetting, getSetting } from "../settings";
import {
  addDays,
  addMonths,
  dayOfWeek,
  diffDaysInclusive,
  eachDayOfRange,
  rangesOverlap,
  toISODate,
} from "../dates";
import type {
  EmployeeStatus,
  LeaveCategory,
  RequestStatus,
} from "@prisma/client";

// ---------------- Tipe ----------------

export type IssueSeverity = "ERROR" | "WARN";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: IssueSeverity;
}

export interface ValidationSettings {
  CFV_DAYS: number;
  CFV_ELIGIBILITY_MONTHS: number;
  CT_ANNUAL_DAYS: number;
  CT_MAX_SINGLE: number;
  CT_MAX_WITH_CFV: number;
  CT_MIN_GAP_DAYS: number;
  POST_CFV_CT_GAP_DAYS: number;
  MIN_NOTICE_DAYS: number;
  TEAM_LEAVE_MAX_PER_DAY: number;
  TEAM_LEAVE_CONFLICT_SEVERITY: IssueSeverity;
  JABATAN_CONFLICT_SEVERITY: IssueSeverity;
  COUNT_WEEKEND_AS_LEAVE: boolean;
}

export interface ActiveRequest {
  id: number;
  leaveTypeId: number;
  category: LeaveCategory;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: RequestStatus;
  packageId: string | null;
}

export interface ValidationInput {
  employee: {
    id: number;
    effectiveDate: Date;
    teamId: number;
    sectionId: number;
    status: EmployeeStatus;
    positionIsOperational: boolean; // Wafor/Foreman/Koordinator
  };
  leaveType: {
    id: number;
    code: string;
    category: LeaveCategory;
    eligibilityMonths: number | null;
    maxSingleDays: number | null;
    maxCombinedWithCfv: number | null;
    requiresAttachment: boolean;
    consumesBalance: boolean;
  };
  startDate: Date;
  endDate: Date;
  excludeRequestId?: number;
  hasAttachment: boolean;
  /** Untuk paket CFV+CT: info pasangan paketnya. */
  pkg?: {
    order: 1 | 2; // 1 = saya CFV, 2 = saya CT
    siblingCategory: LeaveCategory;
    siblingStart: Date;
    siblingEnd: Date;
  } | null;
  settings: ValidationSettings;
  balance: { allocated: number; used: number; pending: number };
  /** Pengajuan aktif milik karyawan (status belum final), termasuk DRAFT? tidak. */
  activeRequests: ActiveRequest[];
  /** Jumlah anggota regu LAIN yang cuti per tanggal (ISO) — status aktif. */
  teamLeaveByDate: Map<string, number>;
  teamSize: number;
  /** Anggota kelompok operasional (wafor/foreman/koordinator) se-seksi yang sedang cuti. */
  operationalOnLeave: { name: string; startDate: Date; endDate: Date }[];
  /** tanggal ISO -> apakah dihitung sebagai hari cuti (false = hari libur yg dikecualikan). */
  holidays: Map<string, boolean>;
  today: Date;
}

export interface ValidationResult {
  valid: boolean;
  totalDays: number;
  issues: ValidationIssue[];
}

const ACTIVE_STATUSES: RequestStatus[] = [
  "SUBMITTED",
  "PENDING_KOORDINATOR",
  "PENDING_WAFOR",
  "PENDING_FOREMAN",
  "PENDING_SPV",
  "APPROVED",
  "CANCEL_REQUESTED",
];

export function isActiveStatus(s: RequestStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

// ---------------- Fungsi murni ----------------

/** Hitung hari cuti: rentang minus hari libur yg dikecualikan & (opsional) weekend. */
export function computeLeaveDays(
  start: Date,
  end: Date,
  holidays: Map<string, boolean>,
  countWeekend: boolean,
): number {
  let n = 0;
  for (const d of eachDayOfRange(start, end)) {
    const iso = toISODate(d);
    if (holidays.has(iso) && holidays.get(iso) === false) continue; // libur dikecualikan
    if (!countWeekend) {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) continue;
    }
    n++;
  }
  return n;
}

/** Hari penuh di antara dua tanggal (eksklusif). 10 Okt -> 18 Okt = 7. */
function gapDays(prevEnd: Date, nextStart: Date): number {
  return Math.round((nextStart.getTime() - prevEnd.getTime()) / 86_400_000) - 1;
}

export function validateLeaveRequest(input: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ code, message, severity: "ERROR" });
  const warn = (code: string, message: string) => issues.push({ code, message, severity: "WARN" });

  const { employee, leaveType, startDate, endDate, settings, today } = input;

  // --- 0. Sanity tanggal ---
  if (startDate > endDate) {
    err("INVALID_RANGE", "Tanggal mulai tidak boleh setelah tanggal selesai.");
    return { valid: false, totalDays: 0, issues };
  }
  if (toISODate(startDate) < toISODate(today)) {
    err("PAST_DATE", "Tanggal mulai tidak boleh di masa lalu.");
  }
  if (employee.status !== "ACTIVE") {
    err("EMPLOYEE_INACTIVE", "Karyawan tidak aktif sehingga tidak dapat mengajukan cuti.");
  }

  // --- 1. Hitung hari ---
  const totalDays = computeLeaveDays(startDate, endDate, input.holidays, settings.COUNT_WEEKEND_AS_LEAVE);
  if (totalDays < 1) {
    err("NO_LEAVE_DAY", "Tidak ada hari cuti yang terhitung pada rentang tersebut.");
    return { valid: false, totalDays, issues };
  }

  // --- 2. Eligibility (masa kerja) ---
  const eligMonths =
    leaveType.category === "CFV"
      ? settings.CFV_ELIGIBILITY_MONTHS
      : leaveType.category === "CT"
        ? 12
        : (leaveType.eligibilityMonths ?? 0);
  if (eligMonths > 0) {
    const eligibleSince = addMonths(employee.effectiveDate, eligMonths);
    if (startDate < eligibleSince) {
      err(
        "NOT_ELIGIBLE",
        `Belum memenuhi syarat masa kerja (${eligMonths} bulan). Hak aktif mulai ${eligibleSince.toISOString().slice(0, 10)}.`,
      );
    }
  }

  // --- 3. Aturan durasi per kategori ---
  const cat = leaveType.category;
  if (cat === "CFV") {
    if (totalDays !== settings.CFV_DAYS) {
      err("CFV_EXACT_DAYS", `CFV harus diambil tepat ${settings.CFV_DAYS} hari (dihitung ${totalDays} hari).`);
    }
  } else if (cat === "CT") {
    const inPackage = !!input.pkg && input.pkg.siblingCategory === "CFV";
    const max = inPackage
      ? (leaveType.maxCombinedWithCfv ?? settings.CT_MAX_WITH_CFV)
      : (leaveType.maxSingleDays ?? settings.CT_MAX_SINGLE);
    if (totalDays > max) {
      err(
        "CT_MAX_EXCEEDED",
        inPackage
          ? `CT yang digabung CFV maksimal ${max} hari (dihitung ${totalDays} hari).`
          : `CT tunggal maksimal ${max} hari (dihitung ${totalDays} hari).`,
      );
    }
  } else if (leaveType.maxSingleDays != null && totalDays > leaveType.maxSingleDays) {
    err("MAX_DAYS_EXCEEDED", `Maksimal ${leaveType.maxSingleDays} hari untuk jenis ini.`);
  }

  // --- 4. Urutan paket CFV+CT ---
  if (input.pkg) {
    const { order, siblingCategory, siblingStart, siblingEnd } = input.pkg;
    if (order === 1) {
      // saya CFV -> pasangan harus CT dan mulai sehari setelah saya selesai
      if (siblingCategory !== "CT" || toISODate(siblingStart) !== toISODate(addDays(endDate, 1))) {
        err("PACKAGE_ORDER", "Paket CFV+CT harus berurutan: CFV dulu, langsung disambung CT.");
      }
    } else {
      if (siblingCategory !== "CFV" || toISODate(siblingEnd) !== toISODate(addDays(startDate, -1))) {
        err("PACKAGE_ORDER", "Paket CFV+CT harus berurutan: CFV dulu, langsung disambung CT.");
      }
    }
  }

  // --- 5. Minimum notice ---
  const noticeDays = Math.round((startDate.getTime() - today.getTime()) / 86_400_000);
  if (noticeDays < settings.MIN_NOTICE_DAYS) {
    err(
      "MIN_NOTICE",
      `Pengajuan minimal ${settings.MIN_NOTICE_DAYS} hari sebelum tanggal mulai (saat ini ${noticeDays} hari).`,
    );
  }

  // --- 6. Overlap dengan pengajuan aktif milik sendiri ---
  for (const r of input.activeRequests) {
    if (input.excludeRequestId && r.id === input.excludeRequestId) continue;
    if (rangesOverlap(startDate, endDate, r.startDate, r.endDate)) {
      err("OVERLAP", "Bertabrakan dengan pengajuan aktif Anda yang lain pada periode tersebut.");
      break;
    }
  }

  // --- 7. Jarak antar CT ---
  if (cat === "CT") {
    const prevCTs = input.activeRequests.filter(
      (r) =>
        r.category === "CT" &&
        (!input.excludeRequestId || r.id !== input.excludeRequestId) &&
        r.status !== "DRAFT",
    );
    for (const r of prevCTs) {
      // hanya bandingkan dengan CT yang berakhir sebelum pengajuan ini mulai
      if (r.endDate < startDate) {
        const g = gapDays(r.endDate, startDate);
        if (g < settings.CT_MIN_GAP_DAYS) {
          err(
            "CT_GAP",
            `Jarak dengan CT sebelumnya kurang dari ${settings.CT_MIN_GAP_DAYS} hari.`,
          );
          break;
        }
      }
    }
    // Aturan 30 hari setelah paket CFV(12)+CT(4)
    const tookFullPackage = prevCTs.some(
      (r) => r.packageId && r.totalDays >= 4 && r.status === "APPROVED",
    );
    if (tookFullPackage) {
      const lastPkgEnd = prevCTs
        .filter((r) => r.packageId && r.status === "APPROVED" && r.endDate < startDate)
        .reduce<Date | null>((m, r) => (m == null || r.endDate > m ? r.endDate : m), null);
      if (lastPkgEnd && gapDays(lastPkgEnd, startDate) < settings.POST_CFV_CT_GAP_DAYS) {
        err(
          "CT_POST_PACKAGE_GAP",
          `Setelah mengambil paket CFV+CT, pengajuan CT berikutnya membutuhkan jarak ${settings.POST_CFV_CT_GAP_DAYS} hari.`,
        );
      }
    }
  }

  // --- 8. Saldo ---
  if (leaveType.consumesBalance) {
    const available = input.balance.allocated - input.balance.used;
    if (totalDays > available + 1e-9) {
      err(
        "INSUFFICIENT_BALANCE",
        `Saldo tidak mencukupi. Tersedia ${fmtNum(available)} hari, dibutuhkan ${totalDays} hari.`,
      );
    } else if (totalDays > available - input.balance.pending + 1e-9 && input.balance.pending > 0) {
      warn(
        "PENDING_BALANCE",
        `Ada ${fmtNum(input.balance.pending)} hari pengajuan pending. Jika semuanya disetujui, saldo tersisa ${fmtNum(available - input.balance.pending - totalDays)} hari.`,
      );
    }
  }

  // --- 9. Konflik regu ---
  {
    const sev = settings.TEAM_LEAVE_CONFLICT_SEVERITY;
    const push = sev === "ERROR" ? err : warn;
    for (const d of eachDayOfRange(startDate, endDate)) {
      const iso = toISODate(d);
      const count = (input.teamLeaveByDate.get(iso) ?? 0) + 1; // + diri sendiri
      if (count > settings.TEAM_LEAVE_MAX_PER_DAY) {
        push(
          "TEAM_CONFLICT",
          `Pada ${iso} sudah ada ${count - 1} anggota regu yang cuti (batas ${settings.TEAM_LEAVE_MAX_PER_DAY} orang/hari).`,
        );
        break; // cukup satu peringatan
      }
    }
  }

  // --- 10. Konflik jabatan (kelompok operasional) ---
  if (employee.positionIsOperational) {
    const clash = input.operationalOnLeave.find((o) =>
      rangesOverlap(startDate, endDate, o.startDate, o.endDate),
    );
    if (clash) {
      const msg = `Bertabrakan dengan cuti ${clash.name} (kelompok operasional: Wafor/Foreman/Koordinator).`;
      if (settings.JABATAN_CONFLICT_SEVERITY === "ERROR") err("POSITION_CONFLICT", msg);
      else warn("POSITION_CONFLICT", msg);
    }
  }

  // --- 11. Lampiran ---
  if (leaveType.requiresAttachment && !input.hasAttachment) {
    err("ATTACHMENT_REQUIRED", "Jenis pengajuan ini mewajibkan lampiran.");
  }

  const valid = !issues.some((i) => i.severity === "ERROR");
  return { valid, totalDays, issues };
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ---------------- Loader dari DB ----------------

export async function loadValidationSettings(): Promise<ValidationSettings> {
  const n = async (k: string, d: number) => getNumberSetting(k, d);
  const sev = async (k: string): Promise<IssueSeverity> =>
    ((await getSetting(k, "WARN")) === "ERROR" ? "ERROR" : "WARN");
  return {
    CFV_DAYS: await n("CFV_DAYS", 12),
    CFV_ELIGIBILITY_MONTHS: await n("CFV_ELIGIBILITY_MONTHS", 5),
    CT_ANNUAL_DAYS: await n("CT_ANNUAL_DAYS", 12),
    CT_MAX_SINGLE: await n("CT_MAX_SINGLE", 6),
    CT_MAX_WITH_CFV: await n("CT_MAX_WITH_CFV", 4),
    CT_MIN_GAP_DAYS: await n("CT_MIN_GAP_DAYS", 7),
    POST_CFV_CT_GAP_DAYS: await n("POST_CFV_CT_GAP_DAYS", 30),
    MIN_NOTICE_DAYS: await n("MIN_NOTICE_DAYS", 10),
    TEAM_LEAVE_MAX_PER_DAY: await n("TEAM_LEAVE_MAX_PER_DAY", 2),
    TEAM_LEAVE_CONFLICT_SEVERITY: await sev("TEAM_LEAVE_CONFLICT_SEVERITY"),
    JABATAN_CONFLICT_SEVERITY: await sev("JABATAN_CONFLICT_SEVERITY"),
    COUNT_WEEKEND_AS_LEAVE: (await getSetting("COUNT_WEEKEND_AS_LEAVE", "true")) === "true",
  };
}

export interface BuildInputArgs {
  employeeId: number;
  leaveTypeId: number;
  startDate: Date;
  endDate: Date;
  excludeRequestId?: number;
  hasAttachment: boolean;
  pkg?: ValidationInput["pkg"];
  today?: Date;
}

/** Siapkan ValidationInput dari database. */
export async function buildValidationInput(args: BuildInputArgs): Promise<ValidationInput> {
  const [employee, leaveType, settings] = await Promise.all([
    db.employee.findUnique({
      where: { id: args.employeeId },
      include: { position: true, team: { include: { employees: { where: { status: "ACTIVE" }, select: { id: true } } } } },
    }),
    db.leaveType.findUnique({ where: { id: args.leaveTypeId } }),
    loadValidationSettings(),
  ]);
  if (!employee) throw new Error("Karyawan tidak ditemukan.");
  if (!leaveType || !leaveType.isActive) throw new Error("Jenis cuti tidak ditemukan / tidak aktif.");

  const today = args.today ?? startOfTodayUTC();

  // Pengajuan aktif milik karyawan
  const myRequests = await db.leaveRequest.findMany({
    where: {
      employeeId: args.employeeId,
      status: { in: ACTIVE_STATUSES },
      ...(args.excludeRequestId ? { id: { not: args.excludeRequestId } } : {}),
    },
    include: { leaveType: { select: { category: true } } },
  });
  const activeRequests: ActiveRequest[] = myRequests.map((r) => ({
    id: r.id,
    leaveTypeId: r.leaveTypeId,
    category: r.leaveType.category,
    startDate: r.startDate,
    endDate: r.endDate,
    totalDays: Number(r.totalDays),
    status: r.status,
    packageId: r.packageId,
  }));

  // Anggota regu lain yang cuti pada rentang ini (per tanggal)
  const teamLeaveByDate = new Map<string, number>();
  const others = await db.leaveRequest.findMany({
    where: {
      employeeId: { not: args.employeeId },
      status: { in: ACTIVE_STATUSES },
      startDate: { lte: args.endDate },
      endDate: { gte: args.startDate },
      employee: { teamId: employee.teamId, status: "ACTIVE" },
    },
    select: { startDate: true, endDate: true },
  });
  for (const r of others) {
    for (const d of eachDayOfRange(maxDate(r.startDate, args.startDate), minDate(r.endDate, args.endDate))) {
      const iso = toISODate(d);
      teamLeaveByDate.set(iso, (teamLeaveByDate.get(iso) ?? 0) + 1);
    }
  }

  // Kelompok operasional se-seksi yang cuti
  const operationalOnLeave: ValidationInput["operationalOnLeave"] = [];
  if (employee.position.isOperationalGroup) {
    const ops = await db.leaveRequest.findMany({
      where: {
        employeeId: { not: args.employeeId },
        status: { in: ACTIVE_STATUSES },
        startDate: { lte: args.endDate },
        endDate: { gte: args.startDate },
        employee: {
          status: "ACTIVE",
          sectionId: employee.sectionId,
          position: { isOperationalGroup: true },
        },
      },
      include: { employee: { select: { name: true } } },
    });
    for (const r of ops) {
      operationalOnLeave.push({ name: r.employee.name, startDate: r.startDate, endDate: r.endDate });
    }
  }

  // Hari libur pada rentang
  const holidays = new Map<string, boolean>();
  const hds = await db.holiday.findMany({
    where: { date: { gte: args.startDate, lte: args.endDate } },
  });
  for (const h of hds) holidays.set(toISODate(h.date), h.countsAsLeaveDay);

  // Saldo (alokasi - terpakai - pending)
  const year = args.startDate.getUTCFullYear();
  const bal = await db.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_periodYear: { employeeId: args.employeeId, leaveTypeId: args.leaveTypeId, periodYear: year } },
  });
  const pendingAgg = await db.leaveRequest.aggregate({
    where: {
      employeeId: args.employeeId,
      leaveTypeId: args.leaveTypeId,
      status: { in: ["SUBMITTED", "PENDING_KOORDINATOR", "PENDING_WAFOR", "PENDING_FOREMAN", "PENDING_SPV"] },
      ...(args.excludeRequestId ? { id: { not: args.excludeRequestId } } : {}),
    },
    _sum: { totalDays: true },
  });

  return {
    employee: {
      id: employee.id,
      effectiveDate: employee.effectiveDate,
      teamId: employee.teamId,
      sectionId: employee.sectionId,
      status: employee.status,
      positionIsOperational: employee.position.isOperationalGroup,
    },
    leaveType: {
      id: leaveType.id,
      code: leaveType.code,
      category: leaveType.category,
      eligibilityMonths: leaveType.eligibilityMonths,
      maxSingleDays: leaveType.maxSingleDays,
      maxCombinedWithCfv: leaveType.maxCombinedWithCfv,
      requiresAttachment: leaveType.requiresAttachment,
      consumesBalance: leaveType.consumesBalance,
    },
    startDate: args.startDate,
    endDate: args.endDate,
    excludeRequestId: args.excludeRequestId,
    hasAttachment: args.hasAttachment,
    pkg: args.pkg ?? null,
    settings,
    balance: {
      allocated: Number(bal?.allocated ?? 0),
      used: Number(bal?.used ?? 0),
      pending: Number(pendingAgg._sum.totalDays ?? 0),
    },
    activeRequests,
    teamLeaveByDate,
    teamSize: employee.team.employees.length,
    operationalOnLeave,
    holidays,
    today,
  };
}

function startOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/** Helper untuk API: validasi + catat konflik terdeteksi (untuk laporan konflik PRD §43). */
export async function validateAndRecord(
  args: BuildInputArgs & { requestId?: number },
): Promise<ValidationResult> {
  const input = await buildValidationInput(args);
  const result = validateLeaveRequest(input);
  if (args.requestId) {
    const conflicts = result.issues.filter(
      (i) => i.code === "TEAM_CONFLICT" || i.code === "POSITION_CONFLICT" || i.code === "OVERLAP",
    );
    if (conflicts.length > 0) {
      await db.leaveRequestConflict.createMany({
        data: conflicts.map((c) => ({
          requestId: args.requestId as number,
          conflictType:
            c.code === "OVERLAP" ? "OVERLAP" : c.code === "TEAM_CONFLICT" ? "REGU" : "JABATAN",
          severity: c.severity === "ERROR" ? "BLOCK" : "WARN",
          description: c.message,
        })),
      }).catch(() => {});
    }
  }
  return result;
}

// Re-export agar mudah dipakai test
export { diffDaysInclusive };
