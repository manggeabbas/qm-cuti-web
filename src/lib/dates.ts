/** Helper tanggal. Aplikasi memakai tanggal murni (tanpa jam) untuk domain cuti.
 *  Semua Date dibuat pada tengah malam UTC agar konsisten dengan kolom @db.Date.
 */

export function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Format tanggal tidak valid: ${s} (gunakan YYYY-MM-DD)`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) throw new Error(`Tanggal tidak valid: ${s}`);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hari ini (UTC) sebagai tanggal murni. */
export function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

export function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCMonth(c.getUTCMonth() + n);
  return c;
}

/** Selisih hari inklusif: 10–12 Okt => 3 */
export function diffDaysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function eachDayOfRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
  return days;
}

/** 0=Minggu .. 6=Sabtu */
export function dayOfWeek(d: Date): number {
  return d.getUTCDay();
}

const BULAN_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "10 Okt 2026" */
export function formatID(d: Date | string): string {
  const dt = typeof d === "string" ? parseISODate(d) : d;
  return `${dt.getUTCDate()} ${BULAN_ID[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** "10–12 Okt 2026" */
export function formatRangeID(start: Date, end: Date): string {
  const s = formatID(start);
  if (toISODate(start) === toISODate(end)) return s;
  const e = formatID(end);
  // ringkas jika bulan & tahun sama: "10–12 Okt 2026"
  const sm = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  return sm ? `${start.getUTCDate()}–${e}` : `${s} – ${e}`;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Awal minggu (Senin) dari tanggal — untuk aturan OFF mingguan. */
export function startOfWeekMonday(d: Date): Date {
  const dow = dayOfWeek(d); // 0=Min..6=Sab
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(d, delta);
}
