"use client";

import { useEffect, useState } from "react";
import { Button, Card, Spinner, EmptyState, PageHeader, ErrorBox, Input, Field, Select } from "@/components/ui";
import { formatID, toISODateInput } from "@/lib/dates-client";

interface Roster { id: number; date: string; team: { code: string; name: string }; shiftType: { code: string; name: string } }
interface Off { id: number; date: string; kind: string; employee: { name: string; nik: string; team: { name: string } } }
interface Team { id: number; code: string; name: string }

const MANAGER_ROLES = ["ADMIN", "SPV", "FOREMAN", "WAFOR"];

export default function ShiftOffPage() {
  const [tab, setTab] = useState<"roster" | "off">("roster");
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [offs, setOffs] = useState<Off[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [month, setMonth] = useState(() => toISODateInput(new Date()).slice(0, 7));
  const [offDate, setOffDate] = useState(toISODateInput(new Date()));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [y, m] = month.split("-").map(Number);
      const from = `${month}-01`;
      const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const [rr, oo, tt, mm] = await Promise.all([
        fetch(`/api/shifts/rosters?from=${from}&to=${to}`).then((r) => r.json()),
        fetch(`/api/off?from=${from}&to=${to}`).then((r) => r.json()),
        fetch(`/api/org/teams`).then((r) => r.json()).catch(() => ({ ok: false })),
        fetch(`/api/auth/me`).then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (!rr.ok) throw new Error(rr.error.message);
      if (!oo.ok) throw new Error(oo.error.message);
      setRosters(rr.data.rosters);
      setOffs(oo.data.items);
      if (tt.ok) setTeams(tt.data.items ?? tt.data);
      if (mm.ok) {
        const roles: string[] = mm.data.user?.roles ?? [];
        setCanManage(roles.some((r) => MANAGER_ROLES.includes(r)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function generate() {
    setError("");
    setSuccess("");
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    try {
      const r = await fetch("/api/shifts/rosters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSuccess(`Roster dibuat: ${j.data.created} baris.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate.");
    }
  }

  async function ajukanOff() {
    setError("");
    setSuccess("");
    try {
      const r = await fetch("/api/off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: offDate }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      const warns = (j.data.warnings ?? []).join(" ");
      setSuccess(`OFF ${formatID(offDate)} tercatat. ${warns}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    }
  }

  return (
    <div>
      <PageHeader title="Shift & OFF" subtitle="Jadwal shift regu dan OFF individu" />
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</div>}

      <div className="mb-4 flex gap-2">
        {(["roster", "off"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {t === "roster" ? "Jadwal Shift" : "OFF Individu"}
          </button>
        ))}
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto w-44" />
      </div>

      {loading ? (
        <Spinner />
      ) : tab === "roster" ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">Rotasi 3 regu × 3 shift. Rabu = OFF bersama.</p>
            {canManage && <Button variant="secondary" onClick={generate}>Generate Otomatis</Button>}
          </div>
          {rosters.length === 0 ? (
            <EmptyState title="Belum ada roster" hint="Klik Generate Otomatis untuk membuat jadwal." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Tanggal</th>
                    <th>Regu</th>
                    <th>Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {rosters.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{formatID(r.date)}</td>
                      <td>{r.team.name}</td>
                      <td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{r.shiftType.name}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Tanggal OFF (Kam–Sel, bukan Rabu)">
                <Input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} />
              </Field>
              <Button onClick={ajukanOff}>Ajukan OFF</Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Maksimal 1x OFF individu per minggu. {teams.length > 0 && `Regu: ${teams.map((t) => t.name).join(", ")}`}</p>
          </Card>
          <Card>
            {offs.length === 0 ? (
              <EmptyState title="Belum ada OFF" hint="Belum ada jadwal OFF pada periode ini." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Tanggal</th>
                    <th>Karyawan</th>
                    <th>Regu</th>
                  </tr>
                </thead>
                <tbody>
                  {offs.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2">{formatID(o.date)}</td>
                      <td>{o.employee.name}</td>
                      <td>{o.employee.team.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
