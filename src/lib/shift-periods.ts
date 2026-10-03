/** Helper periode jadwal shift: auto-lock dan guard edit (PRD §20A.5). */
import db from "./db";
import { ApiError } from "./api";
import { getNumberSetting } from "./settings";

/** Kunci otomatis periode PUBLISHED yang sudah melewati lead-time. */
export async function applyAutoLock(): Promise<number> {
  const leadDays = await getNumberSetting("SHIFT_AUTO_LOCK_LEAD_DAYS", 0);
  if (leadDays <= 0) return 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const threshold = new Date(today.getTime() + leadDays * 86_400_000);
  const res = await db.shiftSchedulePeriod.updateMany({
    where: { status: "PUBLISHED", from: { lte: threshold } },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
  return res.count;
}

/** Pastikan periode (bila ada) masih bisa diubah. */
export async function assertPeriodEditable(periodId: number | null | undefined): Promise<void> {
  if (!periodId) return;
  const p = await db.shiftSchedulePeriod.findUnique({ where: { id: periodId } });
  if (!p) throw new ApiError("NOT_FOUND", "Periode jadwal tidak ditemukan.", 404);
  if (p.status === "LOCKED") {
    throw new ApiError(
      "SCHEDULE_LOCKED",
      `Periode "${p.name}" terkunci. Buka kunci dulu untuk mengubah.`,
      403,
    );
  }
}

/** Ambil status efektif periode (terapkan auto-lock dulu). */
export async function getPeriodStatus(periodId: number) {
  await applyAutoLock();
  return db.shiftSchedulePeriod.findUnique({ where: { id: periodId } });
}
