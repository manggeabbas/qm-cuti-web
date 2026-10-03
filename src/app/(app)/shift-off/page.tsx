"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Spinner, EmptyState, PageHeader, ErrorBox, Input, Field, Select } from "@/components/ui";
import { formatID, toISODateInput } from "@/lib/dates-client";
import { SHIFT_CELL, SHIFT_CATEGORY_ORDER, SHIFT_DOT, SHIFT_LABEL, shiftCategory } from "@/lib/shift-colors";
import PeriodTemplateTab from "./PeriodTemplateTab";
import { fetchJson, hasRole, type MeUser } from "@/components/leave-helpers";

interface Roster {
  id: string;
  date: string;
  team: { id: number; code: string; name: string };
  shiftType: { code: string; name: string; startTime: string | null; endTime: string | null };
}
interface Team {
  id: number;
  code: string;
  name: string;
}
interface EmployeeRow {
  id: number;
  name: string;
  nik: string;
  team: string | null;
  offDayOfWeek: number | null;
  offLocked?: boolean;
}
interface ShiftTypeOption {
  id: number;
  code: string;
  name: string;
  patterns: { dayOfWeek: number; startTime: string; endTime: string }[];
}
interface RotationConfig {
  mode: "WEEKLY" | "FIXED";
  order: string[];
  weekStart: string;
  anchorDate: string;
  anchorMap: Record<string, string>;
}

const DAY_OPTIONS = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"];
const DOW_SHORT = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];
const DOW_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function compactHours(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  return `${start.slice(0, 2)}–${end.slice(0, 2)}`;
}

function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
  return out;
}

export default function ShiftOffPage() {
  const [tab, setTab] = useState<"roster" | "periode" | "off">("roster");
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeOption[]>([]);
  const [rotation, setRotation] = useState<RotationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [month, setMonth] = useState(() => toISODateInput(new Date()).slice(0, 7));
  const [savingConfig, setSavingConfig] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const monthRange = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from, to };
  }, [month]);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rr = await fetch(`/api/shifts/rosters?from=${monthRange.from}&to=${monthRange.to}`).then((r) => r.json());
      if (!rr.ok) throw new Error(rr.error.message);
      setRosters(rr.data.rosters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, rotRes, empRes, meRes] = await Promise.all([
          fetch("/api/org/teams").then((r) => r.json()).catch(() => ({ ok: false })),
          fetch("/api/shifts/rotation").then((r) => r.json()).catch(() => ({ ok: false })),
          fetch("/api/employees?status=ACTIVE&limit=200").then((r) => r.json()).catch(() => ({ ok: false })),
          fetchJson<{ user: MeUser }>("/api/auth/me").catch(() => ({ ok: false as const })),
        ]);
        if (tRes.ok) setTeams(tRes.data.items ?? tRes.data);
        if (rotRes.ok) {
          setRotation(rotRes.data.config);
          setShiftTypes(rotRes.data.shiftTypes);
        }
        if (empRes.ok) setEmployees(empRes.data.items);
        if (meRes.ok) {
          setCanManage(hasRole(meRes.data.user, "ADMIN", "SPV", "WSPV", "FOREMAN", "WAFOR"));
        }
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const days = useMemo(() => monthDays(month), [month]);

  const rosterCells = useMemo(() => {
    const map = new Map<string, Roster>();
    for (const r of rosters) map.set(`${r.team.code}|${r.date.slice(0, 10)}`, r);
    return map;
  }, [rosters]);

  const gridTeams = useMemo(() => {
    const present = new Map<string, Team>();
    for (const r of rosters) present.set(r.team.code, { id: r.team.id, code: r.team.code, name: r.team.name });
    for (const t of teams) if (rotation && t.code in rotation.anchorMap) present.set(t.code, t);
    return [...present.values()];
  }, [teams, rosters, rotation]);

  async function toggleOffLock(e: EmployeeRow) {
    if (!canManage) return;
    setError("");
    try {
      const r = await fetchJson<{ employee: EmployeeRow }>(`/api/employees/${e.id}`, {
        method: "PUT",
        body: JSON.stringify({ offLocked: !e.offLocked }),
      });
      if (!r.ok) throw new Error(r.error.message);
      setEmployees((prev) => prev.map((x) => (x.id === e.id ? { ...x, offLocked: !e.offLocked } : x)));
      setSuccess(`OFF ${e.name} ${!e.offLocked ? "dikunci" : "dibuka"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah kunci OFF.");
    }
  }

  async function persistRotation(): Promise<boolean> {
    if (!rotation) return false;    const anchorMap = Object.fromEntries(Object.entries(rotation.anchorMap).filter(([, v]) => !!v));
    const res = await fetch("/api/shifts/rotation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rotation, anchorMap }),
    });
    const j = await res.json();
    if (!j.ok) {
      setError(j.error.message);
      return false;
    }
    setRotation(j.data.config);
    return true;
  }

  async function saveRotation() {
    setSavingConfig(true);
    setError("");
    setSuccess("");
    try {
      if (await persistRotation()) {
        setSuccess("Pola rotasi disimpan. Jadwal shift langsung berlaku untuk semua tanggal.");
        await loadMonth();
      }
    } finally {
      setSavingConfig(false);
    }
  }

  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div>
      <PageHeader title="Shift & OFF" subtitle="Pola rotasi shift regu dan hari OFF tetap karyawan" />
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      {success && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["roster", "periode", "off"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t === "roster" ? "Jadwal Shift" : t === "periode" ? "Periode & Template" : "Hari OFF"}
          </button>
        ))}
        {tab === "roster" && (
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto w-44" />
        )}
      </div>

      {loading && tab === "roster" ? (
        <Spinner />
      ) : tab === "periode" ? (
        <PeriodTemplateTab canManage={canManage} />
      ) : tab === "roster" ? (
        <div className="space-y-4">
          {rotation && (
            <Card
              title="Pola Rotasi Shift"
              description="Atur acuan minggu ini. Jadwal otomatis berlaku untuk semua tanggal (tidak perlu generate per bulan)."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Mode">
                  <Select
                    value={rotation.mode}
                    onChange={(e) =>
                      setRotation({ ...rotation, mode: e.target.value as RotationConfig["mode"] })
                    }
                  >
                    <option value="WEEKLY">Rotasi Mingguan</option>
                    <option value="FIXED">Tetap (tidak berotasi)</option>
                  </Select>
                </Field>
                <Field label="Awal Minggu">
                  <Select
                    value={rotation.weekStart}
                    onChange={(e) => setRotation({ ...rotation, weekStart: e.target.value })}
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tanggal Acuan (awal minggu)">
                  <Input
                    type="date"
                    value={rotation.anchorDate}
                    onChange={(e) => setRotation({ ...rotation, anchorDate: e.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shift pada minggu acuan
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {teams
                    .filter((t) => t.code !== "LABORATORIUM")
                    .map((t) => (
                      <Field key={t.id} label={t.name}>
                        <Select
                          value={rotation.anchorMap[t.code] ?? ""}
                          onChange={(e) =>
                            setRotation({
                              ...rotation,
                              anchorMap: { ...rotation.anchorMap, [t.code]: e.target.value },
                            })
                          }
                        >
                          <option value="">— Tidak dijadwalkan —</option>
                          {shiftTypes.map((s) => (
                            <option key={s.id} value={s.code}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ))}
                </div>
              </div>

              <div className="mt-4">
                <Button onClick={saveRotation} disabled={savingConfig}>
                  {savingConfig ? "Menyimpan…" : "Simpan Pola"}
                </Button>
              </div>
            </Card>
          )}

          <Card title={`Jadwal Shift ${monthLabel}`} description="Highlight penuh sesuai kategori shift.">
            {gridTeams.length === 0 ? (
              <EmptyState title="Belum ada jadwal" hint="Atur pola rotasi di atas." icon="🕐" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-slate-500">
                        Regu
                      </th>
                      {days.map((iso) => {
                        const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
                        const isWed = dow === 3;
                        return (
                          <th
                            key={iso}
                            className={`min-w-[40px] px-1 py-1 text-center font-medium ${
                              isWed ? "bg-slate-100 text-slate-500" : "text-slate-500"
                            }`}
                            title={`${DOW_FULL[dow]}, ${formatID(iso)}`}
                          >
                            <div>{Number(iso.slice(8, 10))}</div>
                            <div className="text-[9px] font-normal text-slate-400">{DOW_SHORT[dow]}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {gridTeams.map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 font-medium text-slate-700">
                          {t.name}
                        </td>
                        {days.map((iso) => {
                          const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
                          const r = rosterCells.get(`${t.code}|${iso}`);
                          const cat = r
                            ? shiftCategory({
                                code: r.shiftType.code,
                                dayOfWeek: dow,
                                startTime: r.shiftType.startTime,
                                endTime: r.shiftType.endTime,
                              })
                            : dow === 3
                              ? "OFF"
                              : null;
                          return (
                            <td key={iso} className="p-0.5 align-middle">
                              {cat ? (
                                <div
                                  className={`flex min-h-[36px] flex-col items-center justify-center rounded px-0.5 py-1 text-[10px] font-bold leading-tight ${SHIFT_CELL[cat]}`}
                                  title={
                                    r
                                      ? `${r.shiftType.name} ${r.shiftType.startTime ?? ""}–${r.shiftType.endTime ?? ""}`
                                      : "OFF"
                                  }
                                >
                                  <span>{r ? r.shiftType.code.slice(0, 3) : "OFF"}</span>
                                  {(cat === "OPERSHIFT_PAGI" || cat === "OPERSHIFT_MALAM") && (
                                    <span className="rounded bg-black/25 px-1 text-[8px]">12J</span>
                                  )}
                                  {r?.shiftType.startTime && (
                                    <span className="text-[8px] font-normal">
                                      {compactHours(r.shiftType.startTime, r.shiftType.endTime)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="min-h-[36px]" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
              {SHIFT_CATEGORY_ORDER.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className={`h-3 w-3 rounded ${SHIFT_DOT[c]}`} />
                  {SHIFT_LABEL[c]}
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card title="Hari OFF Karyawan" description="Hari OFF mingguan tetap (ketetapan). Rabu = OFF bersama.">
          {employees.length === 0 ? (
            <EmptyState title="Belum ada data karyawan" icon="🌴" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">Karyawan</th>
                    <th className="px-3 py-2">Regu</th>
                    <th className="px-3 py-2">Hari OFF</th>
                    {canManage && <th className="px-3 py-2 text-right">Kunci</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{e.name}</span>
                        <span className="ml-1 font-mono text-xs text-slate-400">{e.nik}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{e.team ?? "-"}</td>
                      <td className="px-3 py-2">
                        {e.offDayOfWeek == null ? (
                          <span className="text-slate-400">Belum diatur</span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            {DOW_FULL[e.offDayOfWeek]}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => toggleOffLock(e)}
                            title={e.offLocked ? "Buka kunci OFF" : "Kunci OFF"}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              e.offLocked
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {e.offLocked ? "🔒 Terkunci" : "🔓 Buka"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
