"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Field, Select, PageHeader, Spinner, EmptyState, ErrorBox } from "@/components/ui";
import Modal from "@/components/Modal";

interface TemplateItem {
  id: number; periodOrder: number;
  team: { id: number; code: string; name: string };
  shiftType: { id: number; code: string; name: string };
}
interface Template {
  id: number; name: string; description: string | null; isActive: boolean; version: number;
  items: TemplateItem[]; _count: { periods: number };
}
interface Period {
  id: number; name: string; from: string; to: string; status: "DRAFT" | "PUBLISHED" | "LOCKED";
  template: { id: number; name: string; version: number } | null; templateVersion: number | null;
  _count: { rosters: number };
}
interface Opt { id: number; code: string; name: string; }

const STATUS_META: Record<Period["status"], { label: string; chip: string }> = {
  DRAFT: { label: "Draft", chip: "bg-slate-100 text-slate-700" },
  PUBLISHED: { label: "Published", chip: "bg-blue-100 text-blue-700" },
  LOCKED: { label: "Terkunci", chip: "bg-amber-100 text-amber-700" },
};

export default function PeriodTemplateTab({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [teams, setTeams] = useState<Opt[]>([]);
  const [shifts, setShifts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tplModal, setTplModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [numPeriods, setNumPeriods] = useState(3);
  const [grid, setGrid] = useState<Record<string, string>>({}); // "order:teamId" -> shiftTypeId

  const [perModal, setPerModal] = useState(false);
  const [perName, setPerName] = useState("");
  const [perFrom, setPerFrom] = useState("");
  const [perTo, setPerTo] = useState("");
  const [perTpl, setPerTpl] = useState("");
  const [perLen, setPerLen] = useState("7");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [t, p, tm, sh] = await Promise.all([
        fetch("/api/shifts/templates").then((r) => r.json()),
        fetch("/api/shifts/periods").then((r) => r.json()),
        fetch("/api/org/teams").then((r) => r.json()).catch(() => ({ ok: false })),
        fetch("/api/shifts/patterns").then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (!t.ok) throw new Error(t.error.message);
      if (!p.ok) throw new Error(p.error.message);
      setTemplates(t.data.items ?? []);
      setPeriods(p.data.items ?? []);
      if (tm.ok) setTeams(tm.data.items ?? tm.data ?? []);
      // shiftTypes dari /api/shifts/patterns
      if (sh.ok) {
        const sts: Opt[] = (sh.data.shiftTypes ?? []).map((s: Opt) => ({ id: s.id, code: s.code, name: s.name }));
        setShifts(sts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openTpl(t?: Template) {
    setEditingTpl(t ?? null);
    setTplName(t?.name ?? "");
    setTplDesc(t?.description ?? "");
    const maxOrder = t ? Math.max(...t.items.map((i) => i.periodOrder)) : 3;
    setNumPeriods(maxOrder);
    const g: Record<string, string> = {};
    if (t) for (const i of t.items) g[`${i.periodOrder}:${i.team.id}`] = String(i.shiftType.id);
    setGrid(g);
    setTplModal(true);
  }

  async function saveTpl() {
    setError(""); setSuccess("");
    const items: { periodOrder: number; teamId: number; shiftTypeId: number }[] = [];
    for (let o = 1; o <= numPeriods; o++) {
      for (const tm of teams) {
        const sid = grid[`${o}:${tm.id}`];
        if (sid) items.push({ periodOrder: o, teamId: tm.id, shiftTypeId: Number(sid) });
      }
    }
    if (items.length === 0) { setError("Isi minimal satu sel rotasi."); return; }
    try {
      const r = await fetch(editingTpl ? `/api/shifts/templates/${editingTpl.id}` : "/api/shifts/templates", {
        method: editingTpl ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tplName.trim(), description: tplDesc.trim() || null, items }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setTplModal(false);
      setSuccess(j.versionBumped ? `Template tersimpan sebagai versi ${j.version}.` : "Template tersimpan.");
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan."); }
  }

  async function createPeriod() {
    setError(""); setSuccess("");
    try {
      const r = await fetch("/api/shifts/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: perName.trim(), from: perFrom, to: perTo,
          templateId: perTpl ? Number(perTpl) : null,
          periodLengthDays: Number(perLen) || 7,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setPerModal(false);
      setSuccess(`Periode dibuat (DRAFT), ${j.created} roster tergenerate.`);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  async function periodAction(id: number, action: "publish" | "lock" | "unlock") {
    if (!confirm({ publish: "Publish periode ini?", lock: "Kunci periode ini?", unlock: "Buka kunci periode ini?" }[action])) return;
    setError(""); setSuccess("");
    try {
      const r = await fetch(`/api/shifts/periods/${id}/${action}`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSuccess(`Periode ${action === "publish" ? "dipublish" : action === "lock" ? "dikunci" : "dibuka"}.`);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal."); }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</div>}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <PageHeader title="Template Rotasi" subtitle="Pola rotasi shift antar regu (berversion)" />
          {canManage && <Button onClick={() => openTpl()}>+ Template</Button>}
        </div>
        {templates.length === 0 ? (
          <EmptyState title="Belum ada template" hint="Buat template rotasi, mis. Rotasi 3 Regu." />
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">
                    {t.name} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">v{t.version}</span>
                    {!t.isActive && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Nonaktif</span>}
                  </p>
                  {canManage && (
                    <Button variant="secondary" onClick={() => openTpl(t)} className="px-3 py-1.5 text-xs">Ubah</Button>
                  )}
                </div>
                {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-2">Periode</th>
                        {teams.map((tm) => <th key={tm.id} className="py-1 pr-2">{tm.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(t.items.map((i) => i.periodOrder))].sort((a, b) => a - b).map((o) => (
                        <tr key={o} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-bold">{o}</td>
                          {teams.map((tm) => {
                            const it = t.items.find((i) => i.periodOrder === o && i.team.id === tm.id);
                            return <td key={tm.id} className="py-1 pr-2">{it ? it.shiftType.name : "—"}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Dipakai {t._count.periods}x periode</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <PageHeader title="Periode Jadwal" subtitle="DRAFT → PUBLISHED → LOCKED" />
          {canManage && <Button onClick={() => setPerModal(true)}>+ Buat Periode</Button>}
        </div>
        {periods.length === 0 ? (
          <EmptyState title="Belum ada periode" hint="Buat periode lalu generate roster dari template." />
        ) : (
          <div className="space-y-2">
            {periods.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
                <div>
                  <p className="font-semibold text-slate-900">
                    {p.name}{" "}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_META[p.status].chip}`}>
                      {STATUS_META[p.status].label}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.from} s/d {p.to} · {p._count.rosters} roster
                    {p.template ? ` · Template: ${p.template.name} (v${p.templateVersion})` : " · Rotasi bawaan"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    {p.status === "DRAFT" && (
                      <Button onClick={() => periodAction(p.id, "publish")} className="px-3 py-1.5 text-xs">Publish</Button>
                    )}
                    {p.status !== "LOCKED" && (
                      <Button variant="secondary" onClick={() => periodAction(p.id, "lock")} className="px-3 py-1.5 text-xs">🔒 Kunci</Button>
                    )}
                    {p.status === "LOCKED" && (
                      <Button variant="secondary" onClick={() => periodAction(p.id, "unlock")} className="px-3 py-1.5 text-xs">🔓 Buka</Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {tplModal && (
        <Modal title={editingTpl ? "Ubah Template" : "Template Baru"} onClose={() => setTplModal(false)} wide>
          <ErrorBox message={error} />
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nama" required><Input value={tplName} onChange={(e) => setTplName(e.target.value)} /></Field>
              <Field label="Jumlah urutan periode">
                <Input type="number" min={1} max={12} value={numPeriods} onChange={(e) => setNumPeriods(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </Field>
            </div>
            <Field label="Deskripsi"><Input value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} /></Field>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Periode</th>
                    {teams.map((tm) => <th key={tm.id} className="py-2 pr-2">{tm.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: numPeriods }, (_, o) => o + 1).map((ord) => (
                    <tr key={ord} className="border-t border-slate-100">
                      <td className="py-2 pr-2 font-bold">{ord}</td>
                      {teams.map((tm) => (
                        <td key={tm.id} className="py-2 pr-2">
                          <Select
                            value={grid[`${ord}:${tm.id}`] ?? ""}
                            onChange={(e) => setGrid((g) => ({ ...g, [`${ord}:${tm.id}`]: e.target.value }))}
                          >
                            <option value="">—</option>
                            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </Select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editingTpl && editingTpl._count.periods > 0 && (
              <p className="text-xs text-amber-600">Template ini sudah dipakai {editingTpl._count.periods}x — menyimpan akan menaikkan versi (v{editingTpl.version} → v{editingTpl.version + 1}). Jadwal lama tidak berubah.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTplModal(false)}>Batal</Button>
              <Button onClick={saveTpl} disabled={!tplName.trim()}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}

      {perModal && (
        <Modal title="Buat Periode Jadwal" onClose={() => setPerModal(false)}>
          <ErrorBox message={error} />
          <div className="space-y-3">
            <Field label="Nama periode" required><Input value={perName} onChange={(e) => setPerName(e.target.value)} placeholder="mis. Oktober Pekan 1" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dari" required><Input type="date" value={perFrom} onChange={(e) => setPerFrom(e.target.value)} /></Field>
              <Field label="Sampai" required><Input type="date" value={perTo} onChange={(e) => setPerTo(e.target.value)} /></Field>
            </div>
            <Field label="Template (kosongkan = rotasi bawaan)">
              <Select value={perTpl} onChange={(e) => setPerTpl(e.target.value)}>
                <option value="">— Rotasi bawaan —</option>
                {templates.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
              </Select>
            </Field>
            <Field label="Durasi tiap urutan (hari)">
              <Input type="number" min={1} max={60} value={perLen} onChange={(e) => setPerLen(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPerModal(false)}>Batal</Button>
              <Button onClick={createPeriod} disabled={!perName.trim() || !perFrom || !perTo}>Buat & Generate</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
