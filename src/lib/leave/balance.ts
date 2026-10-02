/**
 * Ledger saldo cuti (PRD §17).
 * Saldo = agregat transaksi; tabel LeaveBalance adalah cache yg dihitung ulang
 * dari transaksi setiap ada mutasi. PENDING tidak mengurangi saldo final.
 */
import db from "../db";
import { addMonths } from "../dates";
import { getNumberSetting } from "../settings";
import type { Prisma } from "@prisma/client";

export interface BalanceView {
  allocated: number;
  used: number;
  pending: number;
  available: number; // allocated - used
}

type Tx = Prisma.TransactionClient;

function toTx(client?: Tx): Tx {
  return (client ?? db) as Tx;
}

/** Hitung ulang cache LeaveBalance dari transaksi. */
export async function recalcBalance(
  employeeId: number,
  leaveTypeId: number,
  periodYear: number,
  client?: Tx,
): Promise<void> {
  const tx = toTx(client);
  const rows = await tx.leaveBalanceTransaction.findMany({
    where: { employeeId, leaveTypeId, periodYear },
    select: { kind: true, days: true },
  });
  let allocated = 0;
  let used = 0;
  for (const r of rows) {
    const d = Number(r.days);
    if (r.kind === "ALLOCATION" || r.kind === "CORRECTION" || r.kind === "EXPIRY") allocated += d;
    else if (r.kind === "USAGE" || r.kind === "CANCELLATION_REFUND") used -= d; // USAGE negatif, REFUND positif
  }
  await tx.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_periodYear: { employeeId, leaveTypeId, periodYear } },
    create: { employeeId, leaveTypeId, periodYear, allocated, used },
    update: { allocated, used },
  });
}

async function pendingDays(employeeId: number, leaveTypeId: number, client?: Tx): Promise<number> {
  const tx = toTx(client);
  const agg = await tx.leaveRequest.aggregate({
    where: {
      employeeId,
      leaveTypeId,
      status: { in: ["SUBMITTED", "PENDING_KOORDINATOR", "PENDING_WAFOR", "PENDING_FOREMAN", "PENDING_SPV"] },
    },
    _sum: { totalDays: true },
  });
  return Number(agg._sum.totalDays ?? 0);
}

/** Tampilan saldo: Hak / Terpakai / Pending / Tersedia (PRD §17). */
export async function getBalance(
  employeeId: number,
  leaveTypeId: number,
  year: number,
): Promise<BalanceView> {
  const bal = await db.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_periodYear: { employeeId, leaveTypeId, periodYear: year } },
  });
  const allocated = Number(bal?.allocated ?? 0);
  const used = Number(bal?.used ?? 0);
  const pending = await pendingDays(employeeId, leaveTypeId);
  return { allocated, used, pending, available: allocated - used };
}

/** Alokasi manual oleh admin (koreksi/penyesuaian). */
export async function allocate(
  employeeId: number,
  leaveTypeId: number,
  periodYear: number,
  days: number,
  note: string,
  createdById?: number,
  client?: Tx,
): Promise<void> {
  const tx = toTx(client);
  await tx.leaveBalanceTransaction.create({
    data: {
      employeeId,
      leaveTypeId,
      periodYear,
      kind: days >= 0 ? "ALLOCATION" : "EXPIRY",
      days,
      note,
      createdById,
    },
  });
  await recalcBalance(employeeId, leaveTypeId, periodYear, tx);
}

/**
 * Alokasi otomatis saat hak aktif (dipanggil saat validasi/pengajuan):
 * - CFV: sekali, setelah CFV_ELIGIBILITY_MONTHS dari tanggal efektif.
 * - CT: tiap tahun, setelah 12 bulan dari tanggal efektif.
 */
export async function ensureAllocation(employeeId: number, asOf: Date = new Date()): Promise<void> {
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.status !== "ACTIVE") return;

  const cfvType = await db.leaveType.findUnique({ where: { code: "CFV" } });
  const ctType = await db.leaveType.findUnique({ where: { code: "CT" } });
  const year = asOf.getUTCFullYear();

  await db.$transaction(async (tx) => {
    if (cfvType?.isActive) {
      const months = await getNumberSetting("CFV_ELIGIBILITY_MONTHS", 5);
      const days = await getNumberSetting("CFV_DAYS", 12);
      if (asOf >= addMonths(employee.effectiveDate, months)) {
        const exists = await tx.leaveBalanceTransaction.findFirst({
          where: { employeeId, leaveTypeId: cfvType.id, kind: "ALLOCATION" },
        });
        if (!exists) {
          await tx.leaveBalanceTransaction.create({
            data: {
              employeeId,
              leaveTypeId: cfvType.id,
              periodYear: year,
              kind: "ALLOCATION",
              days,
              note: "Alokasi otomatis CFV",
            },
          });
          await recalcBalance(employeeId, cfvType.id, year, tx);
        }
      }
    }
    if (ctType?.isActive) {
      const days = await getNumberSetting("CT_ANNUAL_DAYS", 12);
      if (asOf >= addMonths(employee.effectiveDate, 12)) {
        const exists = await tx.leaveBalanceTransaction.findFirst({
          where: { employeeId, leaveTypeId: ctType.id, periodYear: year, kind: "ALLOCATION" },
        });
        if (!exists) {
          await tx.leaveBalanceTransaction.create({
            data: {
              employeeId,
              leaveTypeId: ctType.id,
              periodYear: year,
              kind: "ALLOCATION",
              days,
              note: `Alokasi otomatis CT tahun ${year}`,
            },
          });
          await recalcBalance(employeeId, ctType.id, year, tx);
        }
      }
    }
  });
}

/** Pemakaian saldo saat pengajuan APPROVED final. Wajib dalam transaksi approval. */
export async function recordUsage(requestId: number, tx: Tx): Promise<void> {
  const req = await tx.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
  const year = req.startDate.getUTCFullYear();
  await tx.leaveBalanceTransaction.create({
    data: {
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      periodYear: year,
      kind: "USAGE",
      days: -Number(req.totalDays),
      requestId,
      note: `Pemakaian ${req.totalDays} hari (pengajuan #${requestId})`,
    },
  });
  await recalcBalance(req.employeeId, req.leaveTypeId, year, tx);
}

/** Pengembalian saldo saat pengajuan APPROVED dibatalkan. Wajib dalam transaksi. */
export async function recordRefund(requestId: number, tx: Tx): Promise<void> {
  const req = await tx.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
  const year = req.startDate.getUTCFullYear();
  const alreadyRefunded = await tx.leaveBalanceTransaction.findFirst({
    where: { requestId, kind: "CANCELLATION_REFUND" },
  });
  if (alreadyRefunded) return;
  await tx.leaveBalanceTransaction.create({
    data: {
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      periodYear: year,
      kind: "CANCELLATION_REFUND",
      days: Number(req.totalDays),
      requestId,
      note: `Pengembalian ${req.totalDays} hari (pembatalan pengajuan #${requestId})`,
    },
  });
  await recalcBalance(req.employeeId, req.leaveTypeId, year, tx);
}
