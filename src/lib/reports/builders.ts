/** Query builder laporan (PRD §43). Mengembalikan {columns, rows} siap export. */
import db from "../db";
import { getBalance } from "../leave/balance";
import { toISODate, formatID } from "../dates";

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface LeaveReportFilter {
  from?: Date;
  to?: Date;
  teamId?: number;
  sectionId?: number;
  positionId?: number;
  employeeId?: number;
  leaveTypeId?: number;
  status?: string;
}

/** Laporan Cuti */
export async function buildLeaveReport(f: LeaveReportFilter): Promise<ReportTable> {
  const rows = await db.leaveRequest.findMany({
    where: {
      ...(f.from || f.to ? { startDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(f.employeeId ? { employeeId: f.employeeId } : {}),
      ...(f.leaveTypeId ? { leaveTypeId: f.leaveTypeId } : {}),
      ...(f.status ? { status: f.status as never } : {}),
      employee: {
        ...(f.teamId ? { teamId: f.teamId } : {}),
        ...(f.sectionId ? { sectionId: f.sectionId } : {}),
        ...(f.positionId ? { positionId: f.positionId } : {}),
      },
    },
    include: {
      employee: { include: { team: true, position: true, section: true } },
      leaveType: true,
    },
    orderBy: { startDate: "desc" },
  });
  return {
    title: "Laporan Cuti",
    columns: ["NIK", "Nama", "Jabatan", "Regu", "Seksi", "Jenis", "Mulai", "Selesai", "Hari", "Status", "Alasan"],
    rows: rows.map((r) => [
      r.employee.nik, r.employee.name, r.employee.position.name, r.employee.team.name,
      r.employee.section.name, r.leaveType.name, formatID(r.startDate), formatID(r.endDate),
      Number(r.totalDays), r.status, r.reason,
    ]),
  };
}

/** Laporan Saldo */
export async function buildBalanceReport(year: number, teamId?: number): Promise<ReportTable> {
  const types = await db.leaveType.findMany({ where: { isActive: true, consumesBalance: true }, orderBy: { sortOrder: "asc" } });
  const employees = await db.employee.findMany({
    where: { status: "ACTIVE", ...(teamId ? { teamId } : {}) },
    include: { team: true },
    orderBy: { name: "asc" },
  });
  const out: (string | number)[][] = [];
  for (const e of employees) {
    for (const t of types) {
      const b = await getBalance(e.id, t.id, year);
      if (b.allocated === 0 && b.used === 0 && b.pending === 0) continue;
      out.push([e.nik, e.name, e.team.name, t.name, year, b.allocated, b.used, b.pending, b.available]);
    }
  }
  return {
    title: `Laporan Saldo Cuti ${year}`,
    columns: ["NIK", "Nama", "Regu", "Jenis Cuti", "Tahun", "Hak", "Terpakai", "Pending", "Sisa"],
    rows: out,
  };
}

/** Laporan Approval */
export async function buildApprovalReport(from?: Date, to?: Date): Promise<ReportTable> {
  const rows = await db.leaveRequestApproval.findMany({
    where: { ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    include: {
      request: { include: { employee: { select: { nik: true, name: true } }, leaveType: { select: { name: true } } } },
      approver: { select: { username: true, employee: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    title: "Laporan Approval",
    columns: ["Waktu", "NIK", "Karyawan", "Jenis", "Tahap", "Approver", "Keputusan", "Catatan"],
    rows: rows.map((a) => [
      a.createdAt.toISOString().slice(0, 16).replace("T", " "),
      a.request.employee.nik, a.request.employee.name, a.request.leaveType.name,
      a.stepRole, a.approver?.employee?.name ?? a.approver?.username ?? "-",
      a.action, a.comment ?? "-",
    ]),
  };
}

/** Laporan Konflik */
export async function buildConflictReport(from?: Date, to?: Date): Promise<ReportTable> {
  const rows = await db.leaveRequestConflict.findMany({
    where: { ...(from || to ? { detectedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    include: {
      request: { include: { employee: { select: { nik: true, name: true, team: { select: { name: true } } } }, leaveType: { select: { name: true } } } },
    },
    orderBy: { detectedAt: "desc" },
  });
  return {
    title: "Laporan Konflik",
    columns: ["Terdeteksi", "NIK", "Nama", "Regu", "Jenis", "Periode", "Tipe Konflik", "Severity", "Deskripsi"],
    rows: rows.map((c) => [
      c.detectedAt.toISOString().slice(0, 16).replace("T", " "),
      c.request.employee.nik, c.request.employee.name, c.request.employee.team.name,
      c.request.leaveType.name, `${toISODate(c.request.startDate)} s/d ${toISODate(c.request.endDate)}`,
      c.conflictType, c.severity, c.description,
    ]),
  };
}
