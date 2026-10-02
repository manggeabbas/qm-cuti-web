"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Input,
  Select,
  Field,
  Badge,
  PageHeader,
  Spinner,
  EmptyState,
  ErrorBox,
} from "@/components/ui";
import Modal from "@/components/Modal";
import Pager from "@/components/Pager";
import { api, Paged } from "@/lib/client-api";
import { hasRole } from "@/lib/role-utils";
import type { RoleName } from "@prisma/client";

type Me = { id: number; username: string; roles: RoleName[] };

interface Employee {
  id: number;
  nik: string;
  name: string;
  effectiveDate: string;
  positionId: number;
  position: string | null;
  level: string | null;
  divisionId: number;
  division: string | null;
  departmentId: number;
  department: string | null;
  sectionId: number;
  section: string | null;
  teamId: number;
  team: string | null;
  supervisorId: number | null;
  supervisor: { id: number; nik: string; name: string } | null;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE" | "RESIGNED";
}

interface Option {
  id: number;
  code: string;
  name: string;
}

const STATUS_OPTS = ["ACTIVE", "INACTIVE", "RESIGNED"];
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Aktif", INACTIVE: "Nonaktif", RESIGNED: "Resign" };

const EMPTY_FORM = {
  nik: "",
  name: "",
  effectiveDate: "",
  positionId: "",
  level: "",
  divisionId: "",
  departmentId: "",
  sectionId: "",
  teamId: "",
  supervisorId: "",
  email: "",
  phone: "",
  status: "ACTIVE",
};

export default function KaryawanPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Employee[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<Option[]>([]);
  const [positions, setPositions] = useState<Option[]>([]);
  const [divisions, setDivisions] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [sections, setSections] = useState<Option[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: number; nik: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isAdmin = !!me && hasRole(me, "ADMIN");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("search", q.trim());
      if (status) params.set("status", status);
      if (teamId) params.set("teamId", teamId);
      const d = await api<Paged<Employee>>(`/api/employees?${params}`);
      setItems(d.items);
      setTotalPages(d.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, q, status, teamId]);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api<{ user: Me }>("/api/auth/me");
        setMe(user);
        const [t, p, dv, dp, sc, sv] = await Promise.all([
          api<Paged<Option>>("/api/org/teams?limit=100"),
          api<Paged<Option>>("/api/positions?limit=100"),
          api<Paged<Option>>("/api/org/divisions?limit=100"),
          api<Paged<Option>>("/api/org/departments?limit=100"),
          api<Paged<Option>>("/api/org/sections?limit=100"),
          api<Paged<{ id: number; nik: string; name: string }>>("/api/employees?status=ACTIVE&limit=100"),
        ]);
        setTeams(t.items);
        setPositions(p.items);
        setDivisions(dv.items);
        setDepartments(dp.items);
        setSections(sc.items);
        setSupervisors(sv.items);
      } catch {
        /* abaikan — halaman tetap tampilkan error dari load() */
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    setForm({
      nik: e.nik,
      name: e.name,
      effectiveDate: e.effectiveDate,
      positionId: String(e.positionId),
      level: e.level ?? "",
      divisionId: String(e.divisionId),
      departmentId: String(e.departmentId),
      sectionId: String(e.sectionId),
      teamId: String(e.teamId),
      supervisorId: e.supervisorId ? String(e.supervisorId) : "",
      email: e.email ?? "",
      phone: e.phone ?? "",
      status: e.status,
    });
    setFormError("");
    setModalOpen(true);
  }

  function set<K extends keyof typeof EMPTY_FORM>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setSaving(true);
    setFormError("");
    try {
      const num = (v: string) => (v === "" ? undefined : Number(v));
      const body = {
        nik: form.nik.trim(),
        name: form.name.trim(),
        effectiveDate: form.effectiveDate,
        positionId: Number(form.positionId),
        level: form.level.trim() || null,
        divisionId: Number(form.divisionId),
        departmentId: Number(form.departmentId),
        sectionId: Number(form.sectionId),
        teamId: Number(form.teamId),
        supervisorId: num(form.supervisorId) ?? null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/api/employees/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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

  async function deactivate(e: Employee) {
    if (!confirm(`Nonaktifkan karyawan ${e.name} (${e.nik})?`)) return;
    try {
      await api(`/api/employees/${e.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menonaktifkan.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Karyawan"
        subtitle="Master data karyawan"
        action={isAdmin ? <Button onClick={openAdd}>+ Tambah</Button> : undefined}
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Cari">
            <Input
              placeholder="NIK / nama…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua</option>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Regu">
            <Select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada karyawan" hint="Tambahkan data karyawan baru." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">NIK</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Jabatan</th>
                <th className="px-4 py-3">Regu</th>
                <th className="px-4 py-3">Atasan</th>
                <th className="px-4 py-3">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{e.nik}</td>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">{e.position ?? "-"}</td>
                  <td className="px-4 py-3">{e.team ?? "-"}</td>
                  <td className="px-4 py-3">{e.supervisor?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge status={e.status} label={STATUS_LABEL[e.status] ?? e.status} />
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => openEdit(e)} className="px-3 py-1.5 text-xs">
                          Ubah
                        </Button>
                        {e.status === "ACTIVE" && (
                          <Button variant="danger" onClick={() => deactivate(e)} className="px-3 py-1.5 text-xs">
                            Nonaktifkan
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />

      {modalOpen && (
        <Modal title={editing ? "Ubah Karyawan" : "Tambah Karyawan"} onClose={() => setModalOpen(false)} wide>
          <ErrorBox message={formError} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="NIK" required>
              <Input value={form.nik} onChange={(e) => set("nik", e.target.value)} />
            </Field>
            <Field label="Nama" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Tanggal Efektif" required>
              <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
            </Field>
            <Field label="Jabatan" required>
              <Select value={form.positionId} onChange={(e) => set("positionId", e.target.value)}>
                <option value="">— Pilih —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Level">
              <Input value={form.level} onChange={(e) => set("level", e.target.value)} placeholder="cth. 3A" />
            </Field>
            <Field label="Atasan Langsung">
              <Select value={form.supervisorId} onChange={(e) => set("supervisorId", e.target.value)}>
                <option value="">— Tidak ada —</option>
                {supervisors
                  .filter((s) => !editing || s.id !== editing.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nik})
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Divisi" required>
              <Select value={form.divisionId} onChange={(e) => set("divisionId", e.target.value)}>
                <option value="">— Pilih —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Departemen" required>
              <Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
                <option value="">— Pilih —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seksi" required>
              <Select value={form.sectionId} onChange={(e) => set("sectionId", e.target.value)}>
                <option value="">— Pilih —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Regu" required>
              <Select value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
                <option value="">— Pilih —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Telepon">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            {editing && (
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
