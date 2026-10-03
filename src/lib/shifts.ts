/**
 * Pola rotasi shift regu (PRD §21).
 *
 * Model: setiap regu punya shift "acuan" pada satu minggu acuan, lalu berputar
 * mengikuti urutan shift tiap minggu (mode WEEKLY) atau tetap (mode FIXED).
 * Rabu = OFF bersama, jadi tidak dibuat roster shift pada hari Rabu.
 */
import db from "./db";
import { getJsonSetting, getSetting } from "./settings";
import { dayOfWeek, eachDayOfRange, parseISODate, toISODate } from "./dates";

export type ShiftRotationMode = "WEEKLY" | "FIXED";

export interface ShiftRotationConfig {
  mode: ShiftRotationMode;
  /** Urutan kode shift saat berputar, mis. ["PAGI","SORE","MALAM"]. */
  order: string[];
  /** Hari mulainya minggu rotasi: 0=Minggu .. 6=Sabtu. Default Kamis (4). */
  weekStartDow: number;
  /** Awal minggu acuan. */
  anchorDate: Date;
  /** Kode regu -> kode shift pada minggu acuan. */
  anchorMap: Record<string, string>;
}

const DEFAULT_ORDER = ["PAGI", "SORE", "MALAM"];
const DEFAULT_ANCHOR_MAP: Record<string, string> = {
  REGU_C: "PAGI",
  REGU_A: "SORE",
  REGU_B: "MALAM",
};
const DEFAULT_ANCHOR_DATE = "2026-10-01"; // Kamis
const DEFAULT_WEEK_START_DOW = 4; // Kamis

export const WEEK_START_NAMES = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
const DOW_BY_NAME: Record<string, number> = Object.fromEntries(
  WEEK_START_NAMES.map((name, idx) => [name, idx]),
);

/** Baca konfigurasi rotasi shift dari system settings. */
export async function getShiftRotationConfig(): Promise<ShiftRotationConfig> {
  const modeRaw = (await getSetting("SHIFT_ROTATION_MODE", "WEEKLY")).toUpperCase();
  const mode: ShiftRotationMode = modeRaw === "FIXED" ? "FIXED" : "WEEKLY";

  const orderRaw = await getSetting("SHIFT_ROTATION_ORDER", DEFAULT_ORDER.join(","));
  const order = orderRaw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const weekStartRaw = (await getSetting("SHIFT_WEEK_START", WEEK_START_NAMES[DEFAULT_WEEK_START_DOW])).toUpperCase();
  const weekStartDow = DOW_BY_NAME[weekStartRaw] ?? DEFAULT_WEEK_START_DOW;

  const anchorRaw = await getSetting("SHIFT_ANCHOR_DATE", DEFAULT_ANCHOR_DATE);
  let anchorDate: Date;
  try {
    anchorDate = parseISODate(anchorRaw);
  } catch {
    anchorDate = parseISODate(DEFAULT_ANCHOR_DATE);
  }

  const anchorMap = await getJsonSetting<Record<string, string>>("SHIFT_ANCHOR_MAP", DEFAULT_ANCHOR_MAP);

  return {
    mode,
    order: order.length > 0 ? order : [...DEFAULT_ORDER],
    weekStartDow,
    anchorDate,
    anchorMap:
      anchorMap && typeof anchorMap === "object" && !Array.isArray(anchorMap)
        ? anchorMap
        : { ...DEFAULT_ANCHOR_MAP },
  };
}

/** Awal minggu rotasi (pada/atau sebelum tanggal) sesuai hari mulai minggu. */
export function startOfShiftWeek(date: Date, weekStartDow: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (d.getUTCDay() !== weekStartDow) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Kode shift untuk sebuah regu pada tanggal tertentu, atau null bila tidak dipetakan. */
export function resolveShiftCode(
  teamCode: string,
  date: Date,
  config: ShiftRotationConfig,
): string | null {
  const anchorShift = config.anchorMap[teamCode];
  if (!anchorShift) return null;
  const idx = config.order.indexOf(anchorShift.toUpperCase());
  if (idx < 0) return anchorShift.toUpperCase(); // shift acuan di luar urutan: biarkan tetap
  if (config.mode === "FIXED") return config.order[idx];

  const weekStart = startOfShiftWeek(date, config.weekStartDow);
  const anchorWeek = startOfShiftWeek(config.anchorDate, config.weekStartDow);
  const weeks = Math.round((weekStart.getTime() - anchorWeek.getTime()) / (7 * 86_400_000));
  const len = config.order.length;
  const shiftIdx = (((idx + weeks) % len) + len) % len;
  return config.order[shiftIdx];
}

/**
 * Isi roster shift untuk rentang tanggal berdasarkan pola rotasi.
 * Rabu dilewati (OFF bersama). Hanya regu yang ada di anchorMap yang diisi.
 */
export async function generateRosters(
  from: Date,
  to: Date,
): Promise<{ applied: number; skipped: number; teams: number }> {
  const config = await getShiftRotationConfig();
  const teamCodes = Object.keys(config.anchorMap);
  const [teams, shiftTypes] = await Promise.all([
    db.team.findMany({ where: { code: { in: teamCodes }, isActive: true } }),
    db.shiftType.findMany({
      where: { isActive: true },
      include: { patterns: { select: { dayOfWeek: true } } },
    }),
  ]);
  const shiftByCode = new Map(shiftTypes.map((s) => [s.code.toUpperCase(), s]));
  // Setiap shift punya jam berbeda per hari (mis. Rabu 07:00-19:00). Bila tidak ada
  // pola untuk hari tersebut (mis. MALAM pada Rabu), regu tsb OFF hari itu.
  const hasPattern = new Set<string>();
  for (const t of shiftTypes) {
    for (const p of t.patterns) hasPattern.add(`${t.id}|${p.dayOfWeek}`);
  }

  // Bersihkan roster lama pada rentang & regu terkait agar tidak ada sisa pola lama.
  const teamIds = teams.map((t) => t.id);
  if (teamIds.length > 0) {
    await db.shiftRoster.deleteMany({
      where: { teamId: { in: teamIds }, date: { gte: from, lte: to } },
    });
  }

  let applied = 0;
  let skipped = 0;
  for (const day of eachDayOfRange(from, to)) {
    const dow = dayOfWeek(day);
    for (const team of teams) {
      const code = resolveShiftCode(team.code, day, config);
      const shift = code ? shiftByCode.get(code) : undefined;
      if (!shift || !hasPattern.has(`${shift.id}|${dow}`)) {
        skipped++;
        continue;
      }
      await db.shiftRoster.create({
        data: { date: day, teamId: team.id, shiftTypeId: shift.id },
      });
      applied++;
    }
  }
  return { applied, skipped, teams: teams.length };
}

/** Rentang minggu (awal..akhir) untuk tanggal tertentu sesuai setelan minggu. */
export function shiftWeekRange(date: Date, config: ShiftRotationConfig): { from: Date; to: Date } {
  const from = startOfShiftWeek(date, config.weekStartDow);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 6);
  return { from, to };
}

export interface ScheduledShift {
  date: string;
  team: { id: number; code: string; name: string };
  shiftType: { id: number; code: string; name: string; startTime: string; endTime: string };
}

/**
 * Hitung jadwal shift dari pola rotasi untuk rentang tanggal apa pun
 * (tanpa perlu membuat/menyimpan roster per bulan). Rabu mengikuti pola
 * peralihan; shift tanpa pola pada hari itu (mis. Malam pada Rabu) = OFF.
 */
export async function buildSchedule(
  from: Date,
  to: Date,
  teamFilter?: number,
): Promise<ScheduledShift[]> {
  const config = await getShiftRotationConfig();
  const teamCodes = Object.keys(config.anchorMap);
  const [teams, shiftTypes] = await Promise.all([
    db.team.findMany({ where: { code: { in: teamCodes }, isActive: true } }),
    db.shiftType.findMany({ where: { isActive: true }, include: { patterns: true } }),
  ]);
  const filteredTeams = teamFilter ? teams.filter((t) => t.id === teamFilter) : teams;
  const shiftByCode = new Map(shiftTypes.map((s) => [s.code.toUpperCase(), s]));

  const out: ScheduledShift[] = [];
  for (const day of eachDayOfRange(from, to)) {
    const dow = dayOfWeek(day);
    for (const team of filteredTeams) {
      const code = resolveShiftCode(team.code, day, config);
      const shift = code ? shiftByCode.get(code) : undefined;
      if (!shift) continue;
      const pat = shift.patterns.find((p) => p.dayOfWeek === dow);
      if (!pat) continue; // OFF (tidak ada pola untuk hari itu)
      out.push({
        date: toISODate(day),
        team: { id: team.id, code: team.code, name: team.name },
        shiftType: {
          id: shift.id,
          code: shift.code,
          name: shift.name,
          startTime: pat.startTime,
          endTime: pat.endTime,
        },
      });
    }
  }
  return out;
}

/** Helper untuk pratinjau: daftar kode shift per regu selama beberapa minggu. */
export function previewRotation(
  config: ShiftRotationConfig,
  weeks: number,
): Array<{ weekStart: string; assignments: Array<{ teamCode: string; shiftCode: string | null }> }> {
  const base = startOfShiftWeek(new Date(), config.weekStartDow);
  const out: Array<{ weekStart: string; assignments: Array<{ teamCode: string; shiftCode: string | null }> }> = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() + i * 7);
    out.push({
      weekStart: toISODate(start),
      assignments: Object.keys(config.anchorMap).map((teamCode) => ({
        teamCode,
        shiftCode: resolveShiftCode(teamCode, start, config),
      })),
    });
  }
  return out;
}
