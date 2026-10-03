"use client";

import { useEffect, useState } from "react";
import {
  Button, Card, Input, Select, Field, Badge,
  PageHeader, Spinner, EmptyState, ErrorBox,
} from "@/components/ui";
import Modal from "@/components/Modal";
import { api } from "@/lib/client-api";

interface WfStep { id: number; stepOrder: number; role: string; }
interface Workflow {
  id: number; name: string; isDefault: boolean; isActive: boolean;
  team: { id: number; code: string; name: string } | null;
  steps: WfStep[];
  _count: { requests: number };
}
interface TeamOpt { id: number; code: string; name: string; }

const STEP_ROLES = ["KOORDINATOR", "WAFOR", "FOREMAN", "WSPV", "SPV"];
const STEP_LABEL: Record<string, string> = {
  KOORDINATOR: "Koordinator", WAFOR: "Wafor", FOREMAN: "Foreman",
  WSPV: "WSPV", SPV: "SPV",
};

const EMPTY = { name: "", teamId: "", isDefault: false, isActive: true, steps: ["FOREMAN", "SPV"] as string[] };

export default function WorkflowPage() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [wf, tm] = await Promise.all([
        api<Workflow[]>("/api/admin/workflows"),
        api<{ items: TeamOpt[] } | TeamOpt[]>("/api/org/teams").catch(() => [] as TeamOpt[]),
      ]);
      setItems(wf);
      setTeams(Array.isArray(tm) ? tm : (tm.items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(w: Workflow) {
    setEditing(w);
    setForm({
      name: w.name,
      teamId: w.team?.id ? String(w.team.id) : "",
      isDefault: w.isDefault,
      isActive: w.isActive,
      steps: w.steps.map((s) => s.role),
    });
    setFormError("");
    setModalOpen(true);
  }

  function setStep(i: number, role: string) {
    setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? role : s)) }));
  }
  function addStep() {
    if (form.steps.length >= 6) return;
    setForm((f) => ({ ...f, steps: [...f.steps, "SPV"] }));
  }
  function removeStep(i: number) {
    if (form.steps.length <= 1) return;
    setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));
  }

  async function save() {
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: form.name.trim(),
        teamId: form.teamId ? Number(form.teamId) : null,
        isDefault: form.isDefault,
        isActive: form.isActive,
        steps: form.steps.map((role) => ({ role })),
      };
      if (editing) {
        await api(`/api/admin/workflows/${editing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/admin/workflows", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(w: Workflow) {
    try {
      await api(`/api/admin/workflows/${w.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal.");
    }
  }

  async function remove(w: Workflow) {
    if (!confirm(`Hapus workflow "${w.name}"?`)) return;
    try {
      await api(`/api/admin/workflows/${w.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Workflow Approval"
        subtitle="Alur persetujuan pengajuan cuti/izin per regu"
        action={<Button onClick={openAdd}>+ Tambah</Button>}
      />
      <ErrorBox message={error} />

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState title="Belum ada workflow" hint="Buat workflow default atau per regu." />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    {w.name}{" "}
                    {w.isDefault && <Badge status="APPROVED" label="Default" />}
                    {!w.isActive && <Badge status="REJECTED" label="Nonaktif" />}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {w.team ? `Regu: ${w.team.name}` : "Berlaku global"} · {w._count.requests} pengajuan memakai
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {w.steps.map((s, i) => (
                      <span key={s.id} className="flex items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {i + 1}. {STEP_LABEL[s.role] ?? s.role}
                        </span>
                        {i < w.steps.length - 1 && <span className="text-slate-400">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openEdit(w)} className="px-3 py-1.5 text-xs">Ubah</Button>
                  <Button variant="secondary" onClick={() => toggleActive(w)} className="px-3 py-1.5 text-xs">
                    {w.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  {!w.isDefault && (
                    <Button variant="danger" onClick={() => remove(w)} className="px-3 py-1.5 text-xs">Hapus</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? "Ubah Workflow" : "Tambah Workflow"} onClose={() => setModalOpen(false)} wide>
          <ErrorBox message={formError} />
          <div className="space-y-3">
            <Field label="Nama workflow" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Default (Foreman → SPV)" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Regu (kosongkan = global)">
                <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">— Global —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <div className="flex items-end gap-4 pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                  Default
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Aktif
                </label>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Tahapan approval (berurutan)</p>
              <div className="space-y-2">
                {form.steps.map((role, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-8 text-sm font-bold text-slate-400">{i + 1}.</span>
                    <Select value={role} onChange={(e) => setStep(i, e.target.value)} className="flex-1">
                      {STEP_ROLES.map((r) => <option key={r} value={r}>{STEP_LABEL[r]}</option>)}
                    </Select>
                    <Button variant="danger" onClick={() => removeStep(i)} disabled={form.steps.length <= 1} className="px-3 py-1.5 text-xs">
                      Hapus
                    </Button>
                  </div>
                ))}
              </div>
              {form.steps.length < 6 && (
                <Button variant="secondary" onClick={addStep} className="mt-2 px-3 py-1.5 text-xs">+ Tambah tahap</Button>
              )}
              <p className="mt-2 text-xs text-slate-500">
                WSPV dan SPV saling menggantikan: bila salah satunya menyetujui, tahap selesai dan keduanya menerima notifikasi.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Menyimpan…" : "Simpan"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
