/**
 * Unit test LeaveValidationService (PRD §59: business logic utama wajib punya automated test).
 * Hanya menguji fungsi murni validateLeaveRequest / computeLeaveDays.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ default: {} }));
vi.mock("../settings", () => ({
  getNumberSetting: vi.fn(),
  getSetting: vi.fn(),
}));

import {
  validateLeaveRequest,
  computeLeaveDays,
  cfvEligibilityMonths,
  type ValidationInput,
  type ValidationSettings,
  type ActiveRequest,
} from "./validation";

const D = (s: string): Date => new Date(`${s}T00:00:00Z`);
const TODAY = D("2026-10-02");

const SETTINGS: ValidationSettings = {
  CFV_DAYS: 12,
  CFV_ELIGIBILITY_MONTHS: 5,
  CFV_ELIGIBILITY_CREW_MONTHS: 5,
  CFV_ELIGIBILITY_FOREMAN_MONTHS: 4,
  CFV_ELIGIBILITY_SPV_MONTHS: 3,
  CT_ANNUAL_DAYS: 12,
  CT_MAX_SINGLE: 6,
  CT_MAX_WITH_CFV: 4,
  CT_MIN_GAP_DAYS: 7,
  POST_CFV_CT_GAP_DAYS: 30,
  MIN_NOTICE_DAYS: 10,
  TEAM_LEAVE_MAX_PER_DAY: 2,
  TEAM_LEAVE_CONFLICT_SEVERITY: "WARN",
  JABATAN_CONFLICT_SEVERITY: "WARN",
  COUNT_WEEKEND_AS_LEAVE: true,
};

function baseInput(over: Partial<ValidationInput> = {}): ValidationInput {
  return {
    employee: {
      id: 1,
      effectiveDate: D("2024-01-15"),
      teamId: 1,
      sectionId: 1,
      status: "ACTIVE",
      positionCode: "CREW",
      positionIsOperational: false,
    },
    leaveType: {
      id: 2,
      code: "CT",
      category: "CT",
      eligibilityMonths: 12,
      maxSingleDays: 6,
      maxCombinedWithCfv: 4,
      requiresAttachment: false,
      consumesBalance: true,
    },
    startDate: D("2026-11-02"),
    endDate: D("2026-11-04"),
    hasAttachment: false,
    pkg: null,
    settings: SETTINGS,
    balance: { allocated: 12, used: 0, pending: 0 },
    activeRequests: [],
    teamLeaveByDate: new Map(),
    teamSize: 5,
    operationalOnLeave: [],
    holidays: new Map(),
    today: TODAY,
    ...over,
  };
}

const cfvType = {
  id: 1,
  code: "CFV",
  category: "CFV" as const,
  eligibilityMonths: 5,
  maxSingleDays: null,
  maxCombinedWithCfv: null,
  requiresAttachment: false,
  consumesBalance: true,
};

function codes(r: { issues: { code: string }[] }): string[] {
  return r.issues.map((i) => i.code);
}

describe("computeLeaveDays", () => {
  it("menghitung inklusif", () => {
    expect(computeLeaveDays(D("2026-10-10"), D("2026-10-12"), new Map(), true)).toBe(3);
  });
  it("mengecualikan hari libur yg countsAsLeaveDay=false", () => {
    const h = new Map([["2026-10-11", false]]);
    expect(computeLeaveDays(D("2026-10-10"), D("2026-10-12"), h, true)).toBe(2);
  });
  it("tetap menghitung libur bila countsAsLeaveDay=true", () => {
    const h = new Map([["2026-10-11", true]]);
    expect(computeLeaveDays(D("2026-10-10"), D("2026-10-12"), h, true)).toBe(3);
  });
});

describe("aturan dasar", () => {
  it("CT standar 3 hari valid", () => {
    const r = validateLeaveRequest(baseInput());
    expect(r.valid).toBe(true);
    expect(r.totalDays).toBe(3);
  });
  it("menolak tanggal mulai setelah tanggal selesai", () => {
    const r = validateLeaveRequest(baseInput({ startDate: D("2026-11-05"), endDate: D("2026-11-04") }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("INVALID_RANGE");
  });
  it("menolak tanggal di masa lalu", () => {
    const r = validateLeaveRequest(baseInput({ startDate: D("2026-09-01"), endDate: D("2026-09-02") }));
    expect(codes(r)).toContain("PAST_DATE");
  });
  it("menolak karyawan non-aktif", () => {
    const r = validateLeaveRequest(baseInput({ employee: { ...baseInput().employee, status: "RESIGNED" } }));
    expect(codes(r)).toContain("EMPLOYEE_INACTIVE");
  });
  it("menolak notice kurang dari 10 hari (AC-006)", () => {
    const r = validateLeaveRequest(baseInput({ startDate: D("2026-10-07"), endDate: D("2026-10-08") }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("MIN_NOTICE");
  });
  it("menolak overlap dengan pengajuan aktif sendiri (AC-007)", () => {
    const active: ActiveRequest[] = [
      { id: 9, leaveTypeId: 2, category: "CT", startDate: D("2026-11-03"), endDate: D("2026-11-05"), totalDays: 3, status: "APPROVED", packageId: null },
    ];
    const r = validateLeaveRequest(baseInput({ activeRequests: active }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("OVERLAP");
  });
  it("menolak bila saldo tidak cukup (AC-003)", () => {
    const r = validateLeaveRequest(baseInput({ balance: { allocated: 12, used: 11, pending: 0 } }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("INSUFFICIENT_BALANCE");
  });
  it("memberi warning bila pending berpotensi menghabiskan saldo", () => {
    const r = validateLeaveRequest(baseInput({ balance: { allocated: 12, used: 0, pending: 10 } }));
    expect(r.valid).toBe(true);
    expect(codes(r)).toContain("PENDING_BALANCE");
  });
  it("mewajibkan lampiran bila jenis cuti membutuhkannya", () => {
    const r = validateLeaveRequest(
      baseInput({ leaveType: { ...baseInput().leaveType, requiresAttachment: true }, hasAttachment: false }),
    );
    expect(codes(r)).toContain("ATTACHMENT_REQUIRED");
  });
});

describe("aturan CFV (AC-004)", () => {
  const cfvBase = () =>
    baseInput({
      leaveType: cfvType,
      startDate: D("2026-11-01"),
      endDate: D("2026-11-12"),
      balance: { allocated: 12, used: 0, pending: 0 },
    });
  it("CFV tepat 12 hari valid", () => {
    const r = validateLeaveRequest(cfvBase());
    expect(r.valid).toBe(true);
    expect(r.totalDays).toBe(12);
  });
  it("CFV tidak tepat 12 hari ditolak", () => {
    const r = validateLeaveRequest({ ...cfvBase(), endDate: D("2026-11-10") });
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("CFV_EXACT_DAYS");
  });
  it("CFV sebelum 5 bulan masa kerja ditolak", () => {
    const r = validateLeaveRequest({
      ...cfvBase(),
      employee: { ...cfvBase().employee, effectiveDate: D("2026-08-01") },
    });
    expect(codes(r)).toContain("NOT_ELIGIBLE");
  });
});

describe("aturan CT (AC-005)", () => {
  it("CT tunggal 7 hari ditolak (maks 6)", () => {
    const r = validateLeaveRequest(baseInput({ startDate: D("2026-11-02"), endDate: D("2026-11-08") }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("CT_MAX_EXCEEDED");
  });
  it("CT butuh jarak 7 hari dari CT sebelumnya", () => {
    const active: ActiveRequest[] = [
      { id: 9, leaveTypeId: 2, category: "CT", startDate: D("2026-10-18"), endDate: D("2026-10-20"), totalDays: 3, status: "APPROVED", packageId: null },
    ];
    const r = validateLeaveRequest(baseInput({ activeRequests: active, startDate: D("2026-10-25"), endDate: D("2026-10-26") }));
    expect(codes(r)).toContain("CT_GAP");
  });
  it("CT lolos bila jarak >= 7 hari", () => {
    const active: ActiveRequest[] = [
      { id: 9, leaveTypeId: 2, category: "CT", startDate: D("2026-10-10"), endDate: D("2026-10-12"), totalDays: 3, status: "APPROVED", packageId: null },
    ];
    const r = validateLeaveRequest(baseInput({ activeRequests: active, startDate: D("2026-10-25"), endDate: D("2026-10-26") }));
    expect(codes(r)).not.toContain("CT_GAP");
  });
  it("CT setelah paket CFV(12)+CT(4) butuh jarak 30 hari", () => {
    const active: ActiveRequest[] = [
      { id: 9, leaveTypeId: 2, category: "CT", startDate: D("2026-09-13"), endDate: D("2026-09-16"), totalDays: 4, status: "APPROVED", packageId: "pkg-1" },
    ];
    const r = validateLeaveRequest(baseInput({ activeRequests: active, startDate: D("2026-10-05"), endDate: D("2026-10-06") }));
    expect(codes(r)).toContain("CT_POST_PACKAGE_GAP");
  });
});

describe("paket CFV+CT", () => {
  it("urutan CFV lalu CT yang bersambungan valid", () => {
    const r = validateLeaveRequest(
      baseInput({
        leaveType: cfvType,
        startDate: D("2026-11-01"),
        endDate: D("2026-11-12"),
        balance: { allocated: 12, used: 0, pending: 0 },
        pkg: { order: 1, siblingCategory: "CT", siblingStart: D("2026-11-13"), siblingEnd: D("2026-11-16") },
      }),
    );
    expect(r.valid).toBe(true);
  });
  it("urutan terbalik ditolak", () => {
    const r = validateLeaveRequest(
      baseInput({
        startDate: D("2026-11-01"),
        endDate: D("2026-11-04"),
        pkg: { order: 2, siblingCategory: "CFV", siblingStart: D("2026-11-05"), siblingEnd: D("2026-11-16") },
      }),
    );
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("PACKAGE_ORDER");
  });
  it("CT dalam paket maksimal 4 hari", () => {
    const r = validateLeaveRequest(
      baseInput({
        startDate: D("2026-11-13"),
        endDate: D("2026-11-17"), // 5 hari
        pkg: { order: 2, siblingCategory: "CFV", siblingStart: D("2026-11-01"), siblingEnd: D("2026-11-12") },
      }),
    );
    expect(codes(r)).toContain("CT_MAX_EXCEEDED");
  });
});

describe("deteksi konflik (AC-007)", () => {
  it("konflik regu memberi warning (tidak memblokir)", () => {
    const teamLeaveByDate = new Map([
      ["2026-11-02", 2],
      ["2026-11-03", 2],
    ]);
    const r = validateLeaveRequest(baseInput({ teamLeaveByDate }));
    expect(r.valid).toBe(true); // WARN saja
    expect(codes(r)).toContain("TEAM_CONFLICT");
  });
  it("konflik regu bisa dikonfigurasi menjadi ERROR", () => {
    const settings = { ...SETTINGS, TEAM_LEAVE_CONFLICT_SEVERITY: "ERROR" as const };
    const teamLeaveByDate = new Map([["2026-11-02", 2]]);
    const r = validateLeaveRequest(baseInput({ settings, teamLeaveByDate }));
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("TEAM_CONFLICT");
  });
  it("konflik jabatan operasional memberi warning", () => {
    const r = validateLeaveRequest(
      baseInput({
        employee: { ...baseInput().employee, positionIsOperational: true },
        operationalOnLeave: [{ name: "Foreman X", startDate: D("2026-11-01"), endDate: D("2026-11-05") }],
      }),
    );
    expect(codes(r)).toContain("POSITION_CONFLICT");
  });
});

describe("eligibility CFV per jabatan (PRD §1A.8)", () => {
  it("Crew = 5 bulan", () => {
    expect(cfvEligibilityMonths("CREW", SETTINGS)).toBe(5);
  });
  it("Foreman/Wafor = 4 bulan", () => {
    expect(cfvEligibilityMonths("FOREMAN", SETTINGS)).toBe(4);
    expect(cfvEligibilityMonths("WAFOR", SETTINGS)).toBe(4);
  });
  it("SPV/WSPV/Koordinator = 3 bulan", () => {
    expect(cfvEligibilityMonths("SPV", SETTINGS)).toBe(3);
    expect(cfvEligibilityMonths("WAKIL_SPV", SETTINGS)).toBe(3);
    expect(cfvEligibilityMonths("KOORDINATOR", SETTINGS)).toBe(3);
  });
  it("CFV ditolak bila masa kerja kurang dari syarat jabatan", () => {
    const input = baseInput({
      employee: {
        ...baseInput().employee,
        positionCode: "FOREMAN",
        effectiveDate: D("2026-08-01"), // ~2 bulan sebelum 2026-10-02
      },
      leaveType: { ...baseInput().leaveType, code: "CFV", category: "CFV" as const },
      startDate: D("2026-11-02"),
      endDate: D("2026-11-13"), // 12 hari
    });
    const r = validateLeaveRequest(input);
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("NOT_ELIGIBLE");
  });
});
