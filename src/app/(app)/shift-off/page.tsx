"use client";

import { useEffect, useState } from "react";
import { Button, Card, Spinner, EmptyState, PageHeader, ErrorBox, Input, Field, Select } from "@/components/ui";
import { formatID, toISODateInput } from "@/lib/dates-client";
import PeriodTemplateTab from "./PeriodTemplateTab";

interface Roster { id: number; date: string; team: { code: string; name: string }; shiftType: { code: string; name: string } }
interface Off { id: number; date: string; kind: string; employee: { id: number; name: string; nik: string; offLocked: boolean; team: { name: string } } }
interface Team { id: number; code: string; name: string }
interface ChangeRequest {
  id: number; action: "ADD" | "REMOVE"; date: string; note: string | null; status: string;
  employee: { id: number; name: string; nik: string; team: { name: string }; position: { name: string } };
  createdAt: string;
}

const MANAGER_ROLES = ["ADMIN", "SPV", "WSPV", "FOREMAN", "WAFOR"];

export default function ShiftOffPage() {
  const [tab, setTab] = useState<"roster" | "periode" | "off">("roster");
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [offs, setOffs] = useState<Off[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [lockMap, setLockMap] = useState<Record<number, boolean>>({});
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
      const [rr, oo, tt, mm, cc] = await Promise.all([
        fetch(`/api/shifts/rosters?from=${from}&to=${to}`).then((r) => r.json()),
        fetch(`/api/off?from=${from}&to=${to}`).then((r) => r.json()),
        fetch(`/api/org/teams`).then((r) => r.json()).catch(() => ({ ok: false })),
        fetch(`/api/auth/me`).then((r) => r.json()).catch(() => ({ ok: false })),
        fetch(`/api/off/change-requests?status=PENDING`).then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (!rr.ok) throw new Error(rr.error.message);
      if (!oo.ok) throw new Error(oo.error.message);
      setRosters(rr.data.rosters);
      setOffs(oo.data.items);
      if (tt.ok) setTeams(tt.data.items ?? tt.data);
      if (cc.ok) setChangeRequests(cc.data.items ?? []);
      if (mm.ok) {
        const roles: string[] = mm.data.user?.roles ?? [];
        setCanManage(roles.some((r) => MANAGER_ROLES.includes(r)));
        setMyEmployeeId(mm.data.user?.employee?.id ?? null);
      }
      const lm: Record<number, boolean> = {};
      for (const o of oo.data.items as Off[]) lm[o.employee.id] = o.employee.offLocked;
      setLockMap(lm);
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
      if (j.data.pendingApproval) {
        setSuccess(`Pengajuan perubahan OFF ${formatID(offDate)} terkirim. Menunggu persetujuan atasan.`);
      } else {
        const warns = (j.data.warnings ?? []).join(" ");
        setSuccess(`OFF ${formatID(offDate)} tercatat. ${warns}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    }
  }

  async function approveCR(id: number) {
    setError(""); setSuccess("");
    try {
      const r = await fetch(`/api/off/change-requests/${id}/approve`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSuccess("Perubahan OFF disetujui dan diterapkan.");
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  async function rejectCR(id: number) {
    const reason = prompt("Alasan penolakan:");
    if (!reason?.trim()) return;
    setError(""); setSuccess("");
    try {
      const r = await fetch(`/api/off/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: reason.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSuccess("Pengajuan ditolak.");
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  async function toggleLock(employeeId: number, employeeName: string) {
    const locked = !(lockMap[employeeId] ?? false);
    if (!confirm(`${locked ? "Kunci" : "Buka kunci"} OFF ${employeeName}? ${locked ? "Perubahan berikutnya butuh persetujuan." : ""}`)) return;
    setError(""); setSuccess("");
    try {
      const r = await fetch(`/api/employees/${employeeId}/off-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setLockMap((m) => ({ ...m, [employeeId]: locked }));
      setSuccess(`OFF ${employeeName} ${locked ? "dikunci" : "dibuka"}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  async function deleteOff(id: number) {
    if (!confirm("Hapus jadwal OFF ini?")) return;
    setError(""); setSuccess("");
    try {
      const r = await fetch(`/api/off/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSuccess(j.data?.pendingApproval ? "Pengajuan hapus OFF terkirim. Menunggu persetujuan." : "OFF dihapus.");
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  return (
    <div>
      <PageHeader title="Shift & OFF" subtitle="Jadwal shift regu dan OFF individu" />
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</div>}

      <div className="mb-4 flex gap-2">
        {(["roster", "periode", "off"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {t === "roster" ? "Jadwal Shift" : t === "periode" ? "Periode & Template" : "OFF Individu"}
          </button>
        ))}
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto w-44" />
      </div>

      {loading ? (
        <Spinner />
      ) : tab === "periode" ? (
        <PeriodTemplateTab canManage={canManage} />
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
          {changeRequests.length > 0 && (
            <Card>
              <p className="mb-3 font-bold text-slate-900">
                {canManage ? "Pengajuan Perubahan OFF (menunggu)" : "Pengajuan OFF Saya (menunggu)"}
              </p>
              <div className="space-y-2">
                {changeRequests.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-sm">
                      <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${c.action === "ADD" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {c.action === "ADD" ? "+ Tambah" : "− Hapus"}
                      </span>
                      <span className="font-semibold">{formatID(c.date)}</span>
                      <span className="text-slate-600"> · {c.employee.name} ({c.employee.team.name})</span>
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Button onClick={() => approveCR(c.id)} className="px-3 py-1.5 text-xs">Setujui</Button>
                        <Button variant="danger" onClick={() => rejectCR(c.id)} className="px-3 py-1.5 text-xs">Tolak</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Tanggal</th>
                    <th>Karyawan</th>
                    <th>Regu</th>
                    {canManage && <th>Kunci</th>}
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {offs.map((o) => {
                    const locked = lockMap[o.employee.id] ?? o.employee.offLocked;
                    const mine = myEmployeeId === o.employee.id;
                    return (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2">{formatID(o.date)}</td>
                      <td>{o.employee.name} {locked && <span title="OFF dikunci">🔒</span>}</td>
                      <td>{o.employee.team.name}</td>
                      {canManage && (
                        <td>
                          <button
                            onClick={() => toggleLock(o.employee.id, o.employee.name)}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locked ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                            title={locked ? "Buka kunci OFF" : "Kunci OFF (perubahan butuh persetujuan)"}
                          >
                            {locked ? "🔒 Terkunci" : "🔓 Terbuka"}
                          </button>
                        </td>
                      )}
                      <td className="text-right">
                        {(canManage || mine) && (
                          <button onClick={() => deleteOff(o.id)} className="text-xs font-semibold text-red-600 hover:underline">
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
