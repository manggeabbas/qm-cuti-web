/**
 * Kategori & warna tampilan shift (dipakai halaman Shift & OFF dan Kalender).
 *
 * "Opershift" = shift panjang hari Rabu untuk peralihan:
 *   - Opershift Pagi  : Rabu 07:00–19:00
 *   - Opershift Malam : Rabu 19:00–07:00
 * Shift normal: Pagi 07:00–15:00, Sore 15:00–23:00, Malam 23:00–07:00.
 */

export type ShiftCategory =
  | "PAGI"
  | "SORE"
  | "MALAM"
  | "OPERSHIFT_PAGI"
  | "OPERSHIFT_MALAM"
  | "OFF";

export interface ShiftLike {
  code?: string | null;
  /** 0=Minggu .. 6=Sabtu. */
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}

/** Tentukan kategori shift, atau null bila bukan shift yang dikenal. */
export function shiftCategory(s: ShiftLike): ShiftCategory | null {
  const code = (s.code ?? "").toUpperCase();
  if (!code) return null;
  if (s.dayOfWeek === 3) {
    if (s.startTime === "07:00" && s.endTime === "19:00") return "OPERSHIFT_PAGI";
    if (s.startTime === "19:00" && s.endTime === "07:00") return "OPERSHIFT_MALAM";
  }
  if (code === "PAGI") return "PAGI";
  if (code === "SORE") return "SORE";
  if (code === "MALAM") return "MALAM";
  return null;
}

/** Kelas Tailwind untuk highlight penuh sel/kartu. */
export const SHIFT_CELL: Record<ShiftCategory, string> = {
  PAGI: "bg-amber-100 text-amber-900",
  SORE: "bg-sky-100 text-sky-900",
  MALAM: "bg-indigo-100 text-indigo-900",
  OPERSHIFT_PAGI: "bg-orange-300 text-orange-950",
  OPERSHIFT_MALAM: "bg-purple-300 text-purple-950",
  OFF: "bg-slate-100 text-slate-400",
};

/** Kelas titik untuk legenda. */
export const SHIFT_DOT: Record<ShiftCategory, string> = {
  PAGI: "bg-amber-400",
  SORE: "bg-sky-400",
  MALAM: "bg-indigo-400",
  OPERSHIFT_PAGI: "bg-orange-500",
  OPERSHIFT_MALAM: "bg-purple-500",
  OFF: "bg-slate-300",
};

export const SHIFT_LABEL: Record<ShiftCategory, string> = {
  PAGI: "Pagi",
  SORE: "Sore",
  MALAM: "Malam",
  OPERSHIFT_PAGI: "Opershift Pagi",
  OPERSHIFT_MALAM: "Opershift Malam",
  OFF: "OFF",
};

export const SHIFT_CATEGORY_ORDER: ShiftCategory[] = [
  "PAGI",
  "SORE",
  "MALAM",
  "OPERSHIFT_PAGI",
  "OPERSHIFT_MALAM",
  "OFF",
];
