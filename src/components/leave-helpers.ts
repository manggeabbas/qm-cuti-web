"use client";

import { hasRole as baseHasRole } from "@/lib/role-utils";
import type { RoleName } from "@prisma/client";

/** hasRole versi longgar — roles dari API berupa string biasa. */
export function hasRole(user: { roles: string[] }, ...roles: string[]): boolean {
  return baseHasRole(user as { roles: RoleName[] }, ...(roles as RoleName[]));
}

export interface ApiFail {
  code?: string;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFail };

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 404) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan (404)." } };
    }
    let body: { ok?: boolean; data?: T; error?: ApiFail } | null = null;
    try {
      body = (await res.json()) as { ok?: boolean; data?: T; error?: ApiFail };
    } catch {
      return { ok: false, error: { message: `Respons server tidak valid (HTTP ${res.status}).` } };
    }
    if (!body || typeof body.ok !== "boolean") {
      return { ok: false, error: { message: `Respons server tidak valid (HTTP ${res.status}).` } };
    }
    if (body.ok) return { ok: true, data: body.data as T };
    return { ok: false, error: body.error ?? { message: "Terjadi kesalahan yang tidak diketahui." } };
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : "Gagal terhubung ke server." } };
  }
}

/* ---------- Tipe data ---------- */

export interface MeEmployee {
  id: number;
  nik: string;
  name: string;
  positionCode: string;
  teamCode: string;
  positionId?: number;
  teamId?: number;
  sectionId?: number;
  departmentId?: number;
  divisionId?: number;
}

export interface MeUser {
  id: number;
  username: string;
  roles: string[];
  employee: MeEmployee | null;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  category: string;
  defaultDays?: number | null;
  maxSingleDays?: number | null;
}

export interface LeaveBalance {
  leaveType: { id: number; code: string; name: string; category: string };
  allocated: number | string;
  used: number | string;
  pending?: number | string | null;
  available?: number | string | null;
}

export interface LeaveRequestItem {
  id: number;
  leaveType: { name: string; code: string; category: string };
  startDate: string;
  endDate: string;
  totalDays: number | string;
  status: string;
  reason: string;
  submittedAt?: string | null;
  createdAt?: string | null;
  packageId?: string | null;
  packageOrder?: number | null;
}

export const PENDING_STATUSES = [
  "SUBMITTED",
  "PENDING_KOORDINATOR",
  "PENDING_WAFOR",
  "PENDING_FOREMAN",
  "PENDING_SPV",
];

export const APPROVER_ROLES = ["FOREMAN", "WAFOR", "KOORDINATOR", "SPV"];

/** Item minimal yang bisa dikelompokkan sebagai paket. */
export interface PackageableItem {
  id: number;
  packageId?: string | null;
  packageOrder?: number | null;
  leaveType: { name: string; code?: string | null };
  startDate: string;
  endDate: string;
  totalDays: number | string;
  status: string;
  reason: string;
}

/** Satu grup tampilan: pengajuan tunggal atau satu paket (CFV+CT). */
export interface RequestGroup<T extends PackageableItem = PackageableItem> {
  key: string;
  isPackage: boolean;
  /** id bagian pertama (untuk link/detail & aksi approval). */
  primaryId: number;
  title: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason: string;
  parts: T[];
}

/**
 * Kelompokkan daftar pengajuan berdasarkan packageId.
 * Urutan grup mengikuti urutan item pertama yang muncul.
 */
export function groupByPackage<T extends PackageableItem>(items: T[]): RequestGroup<T>[] {
  const groups: RequestGroup<T>[] = [];
  const byKey = new Map<string, RequestGroup<T>>();
  for (const it of items) {
    const key = it.packageId ? `pkg:${it.packageId}` : `single:${it.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        isPackage: !!it.packageId,
        primaryId: it.id,
        title: "",
        startDate: it.startDate,
        endDate: it.endDate,
        totalDays: 0,
        status: it.status,
        reason: it.reason,
        parts: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.parts.push(it);
  }
  for (const g of groups) {
    g.parts.sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0) || a.id - b.id);
    const first = g.parts[0];
    g.primaryId = first.id;
    g.startDate = g.parts.reduce((m, p) => (p.startDate < m ? p.startDate : m), g.parts[0].startDate);
    g.endDate = g.parts.reduce((m, p) => (p.endDate > m ? p.endDate : m), g.parts[0].endDate);
    g.totalDays = g.parts.reduce((s, p) => s + Number(p.totalDays || 0), 0);
    // status: pakai status bagian pertama (paket selalu jalan beriringan pasca-perbaikan backend)
    g.status = first.status;
    g.reason = first.reason;
    g.title = g.isPackage
      ? `Paket ${g.parts.map((p) => p.leaveType.code ?? p.leaveType.name).join(" + ")}`
      : first.leaveType.name;
  }
  return groups;
}

/** Status yang masih bisa dibatalkan oleh pengaju. */
export const CANCELLABLE_STATUSES = ["DRAFT", ...PENDING_STATUSES];

/* ---------- Tanggal (string YYYY-MM-DD, zona Asia/Makassar) ---------- */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" (atau ISO penuh) sebagai tanggal lokal tanpa geser zona waktu. */
export function parseISODate(s: string): Date {
  return new Date(s.length <= 10 ? `${s}T00:00:00` : s);
}

export function addDaysISO(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Selisih hari inklusif (start & end dihitung). */
export function diffDaysInclusive(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function formatDateID(s: string | null | undefined): string {
  if (!s) return "—";
  const d = parseISODate(s);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(d);
}

export function formatDateTimeID(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(d);
}

/** Angka desimal dari API (Decimal bisa datang sebagai string) → tampilan rapi. */
export function fmtNum(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
