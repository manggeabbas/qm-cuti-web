"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import {
  addDaysISO,
  fetchJson,
  formatDateID,
  hasRole,
  parseISODate,
  toISODate,
  type MeUser,
} from "@/components/leave-helpers";
import { SHIFT_CELL, SHIFT_CATEGORY_ORDER, SHIFT_DOT, SHIFT_LABEL, shiftCategory } from "@/lib/shift-colors";

interface CalEvent {
  id: number | string;
  title: string;
  start: string;
  end: string;
  kind: "leave" | "off" | "holiday" | "shift";
  status?: string;
  employeeName?: string;
  teamCode?: string;
  leaveType?: string;
  shiftCode?: string | null;
  shiftName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

interface Team {
  id: number;
  code: string;
  name: string;
}

const KIND_META: Record<CalEvent["kind"], { label: string; dot: string; chip: string }> = {
  leave: { label: "Cuti", dot: "bg-blue-500", chip: "bg-blue-100 text-blue-800" },
  off: { label: "OFF", dot: "bg-yellow-500", chip: "bg-yellow-100 text-yellow-800" },
  holiday: { label: "Libur", dot: "bg-red-500", chip: "bg-red-100 text-red-800" },
  shift: { label: "Shift", dot: "bg-cyan-500", chip: "bg-cyan-100 text-cyan-800" },
};

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function monthTitle(y: number, m: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(y, m, 1));
}

/** Agenda satu hari penuh. */
function DayAgenda({ date, events, onPickDate }: { date: string; events: CalEvent[]; onPickDate: (d: string) => void }) {
  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between">
        <button
          onClick={() => onPickDate(addDaysISO(date, -1))}
          className="rounded-xl px-3 py-2 text-xl text-slate-600 hover:bg-slate-100"
          aria-label="Hari sebelumnya"
        >
          ‹
        </button>
        <p className="font-bold text-slate-900">{formatDateID(date)}</p>
        <button
          onClick={() => onPickDate(addDaysISO(date, 1))}
          className="rounded-xl px-3 py-2 text-xl text-slate-600 hover:bg-slate-100"
          aria-label="Hari berikutnya"
        >
          ›
        </button>
      </Card>
      <Card>
        {events.length === 0 ? (
          <EmptyState title="Tidak ada jadwal" hint="Tidak ada cuti, OFF, shift, atau libur pada tanggal ini." />
        ) : (
          <div className="space-y-2">
            {events.map((e, i) => (
              <div key={`${e.id}-${i}`} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {[e.employeeName, e.teamCode, e.leaveType].filter(Boolean).join(" · ") || e.kind}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_META[e.kind]?.chip ?? "bg-slate-100 text-slate-700"}`}>
                  {KIND_META[e.kind]?.label ?? e.kind}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="flex flex-wrap gap-3 px-1 text-xs text-slate-600">
        {(Object.keys(KIND_META) as CalEvent["kind"][]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} />
            {KIND_META[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function KalenderPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState("");

  /* Data user login → tentukan apakah bisa filter regu */
  useEffect(() => {
    (async () => {
      const r = await fetchJson<{ user: MeUser }>("/api/auth/me");
      if (!r.ok) return;
      if (hasRole(r.data.user, "FOREMAN", "WAFOR", "KOORDINATOR", "WSPV", "SPV", "ADMIN")) {
        const rt = await fetchJson<Team[] | { items: Team[] }>("/api/org/teams");
        if (rt.ok) {
          const d = rt.data;
          setTeams(Array.isArray(d) ? d : (d.items ?? []));
        }
      }
    })();
  }, []);

  /* Rentang tanggal yang terlihat di grid (Senin pertama s/d Minggu terakhir) */
  const { cells, rangeFrom, rangeTo } = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Senin = 0
    const gridStart = addDaysISO(toISODate(first), -lead);
    const arr: string[] = [];
    for (let i = 0; i < 42; i++) arr.push(addDaysISO(gridStart, i));
    return { cells: arr, rangeFrom: arr[0], rangeTo: arr[41] };
  }, [year, month]);

  /* Sel minggu berjalan (Senin–Minggu) berdasar tanggal terpilih / hari ini */
  const weekCells = useMemo(() => {
    const anchor = selected ?? toISODate(new Date());
    const d = parseISODate(anchor);
    const lead = (d.getDay() + 6) % 7;
    const start = addDaysISO(anchor, -lead);
    return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  }, [selected]);

  /* Muat event tiap ganti bulan / filter regu */
  useEffect(() => {
    setEvents(null);
    setNotReady(false);
    setError("");
    (async () => {
      const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      if (teamId) qs.set("teamId", teamId);
      const r = await fetchJson<{ events: CalEvent[] }>(`/api/calendar?${qs}`);
      if (!r.ok) {
        if (r.error.code === "NOT_FOUND") setNotReady(true);
        else setError(r.error.message);
        return;
      }
      setEvents(r.data.events ?? []);
    })();
  }, [rangeFrom, rangeTo, teamId]);

  /* Petakan tanggal → daftar event (rentang multi-hari dipecah per hari) */
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events ?? []) {
      const s = e.start.slice(0, 10);
      const en = (e.end ?? e.start).slice(0, 10);
      let cur = s;
      let guard = 0;
      while (cur <= en && guard++ < 370) {
        if (cur >= rangeFrom && cur <= rangeTo) {
          const list = map.get(cur) ?? [];
          list.push(e);
          map.set(cur, list);
        }
        cur = addDaysISO(cur, 1);
      }
    }
    return map;
  }, [events, rangeFrom, rangeTo]);

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  function nav(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Kalender" subtitle="Jadwal cuti, OFF, shift, dan hari libur." />

      {/* Navigasi bulan */}
      <Card className="flex items-center justify-between gap-2">
        <button
          onClick={() => nav(-1)}
          className="rounded-xl px-3 py-2 text-xl text-slate-600 hover:bg-slate-100"
          aria-label="Bulan sebelumnya"
        >
          ‹
        </button>
        <p className="font-bold text-slate-900">{monthTitle(year, month)}</p>
        <button
          onClick={() => nav(1)}
          className="rounded-xl px-3 py-2 text-xl text-slate-600 hover:bg-slate-100"
          aria-label="Bulan berikutnya"
        >
          ›
        </button>
      </Card>

      {/* Pilihan tampilan */}
      <div className="flex gap-2">
        {(["month", "week", "day"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === v ? "bg-cyan-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {v === "month" ? "Bulan" : v === "week" ? "Minggu" : "Hari"}
          </button>
        ))}
      </div>

      {/* Filter regu (approver) */}
      {teams && teams.length > 0 && (
        <div className="max-w-xs">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Semua regu</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </Select>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {notReady ? (
        <EmptyState title="Kalender segera hadir" hint="Fitur kalender sedang disiapkan tim backend." />
      ) : events === null && !error ? (
        <Spinner />
      ) : view === "day" ? (
        <DayAgenda
          date={selected ?? toISODate(new Date())}
          events={byDay.get(selected ?? toISODate(new Date())) ?? []}
          onPickDate={setSelected}
        />
      ) : view === "week" ? (
        <>
          <Card className="!p-2 sm:!p-3">
            <div className="grid grid-cols-7 gap-1">
              {weekCells.map((iso) => {
                const d = parseISODate(iso);
                const evs = byDay.get(iso) ?? [];
                const isSel = selected === iso;
                const isToday = iso === toISODate(new Date());
                return (
                  <button
                    key={iso}
                    onClick={() => { setSelected(iso); setView("day"); }}
                    className={`flex min-h-24 flex-col rounded-lg p-1.5 text-left text-xs transition ${
                      isSel ? "bg-cyan-100 ring-2 ring-cyan-500" : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`text-[10px] font-bold uppercase ${isToday ? "text-cyan-700" : "text-slate-400"}`}>
                      {DAY_NAMES[(d.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-base font-bold ${isToday ? "text-cyan-700" : "text-slate-800"}`}>
                      {d.getDate()}
                    </span>
                    <span className="mt-1 space-y-0.5 overflow-hidden">
                      {evs.slice(0, 3).map((e, i) => (
                        <span key={`${e.id}-${i}`} className={`block truncate rounded px-1 py-0.5 text-[10px] font-semibold ${KIND_META[e.kind]?.chip ?? "bg-slate-100"}`}>
                          {e.title}
                        </span>
                      ))}
                      {evs.length > 3 && <span className="text-[10px] text-slate-400">+{evs.length - 3} lagi</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
          <div className="flex flex-wrap gap-3 px-1 text-xs text-slate-600">
            {(Object.keys(KIND_META) as CalEvent["kind"][]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} />
                {KIND_META[k].label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Grid bulan */}
          <Card className="!p-2 sm:!p-3">
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {DAY_NAMES.map((d) => (
                <div
                  key={d}
                  className="pb-1 text-center text-[11px] font-bold uppercase text-slate-400"
                >
                  {d}
                </div>
              ))}
              {cells.map((iso) => {
                const dateObj = parseISODate(iso);
                const dayNum = dateObj.getDate();
                const dow = dateObj.getDay(); // parseISODate versi lokal -> pakai getDay() lokal
                const inMonth = dateObj.getMonth() === month;
                const evs = byDay.get(iso) ?? [];
                const isSel = selected === iso;
                const dayShifts = evs.filter((e) => e.kind === "shift");
                const soleShift = dayShifts.length === 1 ? dayShifts[0] : null;
                const others = evs.filter((e) => e.kind !== "shift");
                const isEmployeeView = !Array.isArray(teams);
                const ownOff = isEmployeeView && others.some((e) => e.kind === "off");
                const cat = inMonth
                  ? ownOff
                    ? "OFF"
                    : soleShift
                      ? shiftCategory({
                          code: soleShift.shiftCode,
                          dayOfWeek: dow,
                          startTime: soleShift.startTime,
                          endTime: soleShift.endTime,
                        })
                      : dow === 3
                        ? "OFF"
                        : null
                  : null;
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso)}
                    className={`flex min-h-14 flex-col items-center justify-start rounded-lg p-1 text-xs transition sm:min-h-16 sm:p-1.5 ${
                      isSel ? "ring-2 ring-cyan-500 " : ""
                    }${
                      inMonth
                        ? cat
                          ? SHIFT_CELL[cat]
                          : "bg-slate-50 hover:bg-slate-100"
                        : "bg-white text-slate-300"
                    }`}
                  >
                    <span className="font-semibold">{dayNum}</span>
                    {inMonth && (ownOff || soleShift || dow === 3) && (
                      <span className="text-[9px] font-bold">
                        {ownOff ? "OFF" : soleShift ? soleShift.shiftCode : "OFF"}
                        {(cat === "OPERSHIFT_PAGI" || cat === "OPERSHIFT_MALAM") && (
                          <span className="ml-0.5 rounded bg-black/25 px-1 text-[8px]">12J</span>
                        )}
                      </span>
                    )}
                    {others.length > 0 && (
                      <span className="mt-0.5 flex gap-0.5">
                        {others.slice(0, 3).map((e, i) => (
                          <span
                            key={`${e.id}-${i}`}
                            className={`h-1.5 w-1.5 rounded-full ${KIND_META[e.kind]?.dot ?? "bg-slate-400"}`}
                          />
                        ))}
                      </span>
                    )}
                    {others.length > 3 && (
                      <span className="text-[9px] text-slate-400">+{others.length - 3}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Legenda */}
          <div className="space-y-2 px-1 text-xs text-slate-600">
            <div className="flex flex-wrap gap-3">
              {(["leave", "off", "holiday"] as CalEvent["kind"][]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} />
                  {KIND_META[k].label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {SHIFT_CATEGORY_ORDER.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className={`h-3 w-3 rounded ${SHIFT_DOT[c]}`} />
                  {SHIFT_LABEL[c]}
                </span>
              ))}
            </div>
          </div>

          {/* Event hari terpilih */}
          {selected && (
            <Card>
              <p className="mb-2 font-bold text-slate-900">{formatDateID(selected)}</p>
              {selectedEvents.length === 0 ? (
                <EmptyState title="Tidak ada jadwal" hint="Tidak ada cuti, OFF, shift, atau libur pada tanggal ini." />
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e, i) => (
                    <div
                      key={`${e.id}-${i}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
                        <p className="text-xs text-slate-500">
                          {e.kind === "shift"
                            ? `Regu ${e.teamCode ?? "-"}`
                            : [e.employeeName, e.teamCode, e.leaveType].filter(Boolean).join(" · ") || e.kind}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_META[e.kind]?.chip ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {KIND_META[e.kind]?.label ?? e.kind}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
