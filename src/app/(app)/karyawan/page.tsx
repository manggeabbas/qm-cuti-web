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
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import Pager from "@/components/Pager";
import { api, Paged } from "@/lib/client-api";
import { hasRole } from "@/lib/role-utils";
import { SHIFT_CELL, shiftCategory } from "@/lib/shift-colors";
import type { RoleName } from "@prisma/client";

type Me = { id: number; username: string; roles: RoleName[] };

interface HistItem {
  id: number; fieldLabel: string; oldLabel: string | null; newLabel: string | null;
  effectiveDate: string | null; changedBy: string | null; createdAt: string;
}

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
  shiftToday?: { code: string; name: string; startTime: string | null; endTime: string | null; dayOfWeek: number } | null;
  supervisorId: number | null;
  supervisor: { id: number; nik: string; name: string } | null;
  email: string | null;
  phone: string | null;
  gender: "LAKI_LAKI" | "PEREMPUAN" | null;
  status: "ACTIVE" | "INACTIVE" | "RESIGNED";
}

interface Option {
  id: number;
  code: string;
  name: string;
}

interface OrgOption extends Option {
  parent?: { id: number; code: string; name: string } | null;
}

const STATUS_OPTS = ["ACTIVE", "INACTIVE", "RESIGNED"];
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Aktif", INACTIVE: "Nonaktif", RESIGNED: "Resign" };

function ShiftToday({ shift }: { shift: Employee["shiftToday"] }) {
  if (!shift) return <span className="text-slate-400">—</span>;
  const cat = shiftCategory({
    code: shift.code,
    dayOfWeek: shift.dayOfWeek,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className={`inline-block w-fit rounded px-2 py-0.5 text-xs font-semibold ${cat ? SHIFT_CELL[cat] : "bg-slate-100 text-slate-700"}`}>
        {shift.code}
      </span>
      {shift.startTime && (
        <span className="text-[10px] text-slate-500">
          {shift.startTime}–{shift.endTime}
        </span>
      )}
    </span>
  );
}

const EMPTY_FORM = {
  nik: "",
  name: "",
  gender: "",
  effectiveDate: "",
  positionId: "",
  level: "",
  companyId: "",
  departmentId: "",
  divisionId: "",
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
  const [teams, setTeams] = useState<OrgOption[]>([]);
  const [positions, setPositions] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<OrgOption[]>([]);
  const [divisions, setDivisions] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: number; nik: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histEmp, setHistEmp] = useState<Employee | null>(null);
  const [histItems, setHistItems] = useState<HistItem[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  async function openHistory(e: Employee) {
    setHistEmp(e);
    setHistOpen(true);
    setHistLoading(true);
    try {
      const d = await api<{ items: HistItem[] }>(`/api/employees/${e.id}/history`);
      setHistItems(d.items);
    } catch {
      setHistItems([]);
    } finally {
      setHistLoading(false);
    }
  }
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
        const [t, p, cp, dv, dp, sc, sv] = await Promise.all([
          api<Paged<OrgOption>>("/api/org/teams?limit=100"),
          api<Paged<Option>>("/api/positions?limit=100"),
          api<Paged<OrgOption>>("/api/org/companies?limit=100"),
          api<Paged<OrgOption>>("/api/org/divisions?limit=100"),
          api<Paged<OrgOption>>("/api/org/departments?limit=100"),
          api<Paged<OrgOption>>("/api/org/sections?limit=100"),
          api<Paged<{ id: number; nik: string; name: string }>>("/api/employees?status=ACTIVE&limit=100"),
        ]);
        setTeams(t.items);
        setPositions(p.items);
        setCompanies(cp.items);
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
      companyId: (() => {
        const dept = departments.find((d) => d.id === e.departmentId);
        return dept?.parent ? String(dept.parent.id) : "";
      })(),
      departmentId: String(e.departmentId),
      divisionId: String(e.divisionId),
      sectionId: String(e.sectionId),
      teamId: String(e.teamId),
      supervisorId: e.supervisorId ? String(e.supervisorId) : "",
      email: e.email ?? "",
      phone: e.phone ?? "",
      gender: e.gender ?? "",
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
        gender: form.gender || null,
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

  // Pilihan organisasi mengikuti induk yang dipilih (cascade).
  const deptOptions = departments.filter((d) => !form.companyId || d.parent?.id === Number(form.companyId));
  const divOptions = divisions.filter((v) => !form.departmentId || v.parent?.id === Number(form.departmentId));
  const secOptions = sections.filter((s) => !form.divisionId || s.parent?.id === Number(form.divisionId));
  const teamOptions = teams.filter((t) => !form.sectionId || t.parent?.id === Number(form.sectionId));

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
      ) : (
        <DataTable
          rows={items}
          rowKey={(e) => e.id}
          emptyTitle="Belum ada karyawan"
          emptyHint="Tambahkan data karyawan baru."
          emptyIcon="👥"
          columns={[
            { key: "nik", header: "NIK", render: (e) => <span className="font-mono text-xs">{e.nik}</span> },
            { key: "name", header: "Nama", render: (e) => <span className="font-medium text-slate-900">{e.name}</span> },
            { key: "position", header: "Jabatan", render: (e) => e.position ?? "-" },
            { key: "team", header: "Regu", render: (e) => e.team ?? "-" },
            {
              key: "shift",
              header: "Shift Hari Ini",
              hideOnMobile: true,
              render: (e) => <ShiftToday shift={e.shiftToday} />,
            },
            { key: "supervisor", header: "Atasan", hideOnMobile: true, render: (e) => e.supervisor?.name ?? "-" },
            {
              key: "status",
              header: "Status",
              hideOnMobile: true,
              render: (e) => <Badge status={e.status} label={STATUS_LABEL[e.status] ?? e.status} />,
            },
          ]}
          actions={
            isAdmin
              ? (e) => (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openHistory(e)}>
                      Riwayat
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                      Ubah
                    </Button>
                    {e.status === "ACTIVE" && (
                      <Button size="sm" variant="danger" onClick={() => deactivate(e)}>
                        Nonaktifkan
                      </Button>
                    )}
                  </>
                )
              : undefined
          }
        />

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
            <Field label="Jenis Kelamin" required>
              <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">— Pilih —</option>
                <option value="LAKI_LAKI">Laki-laki</option>
                <option value="PEREMPUAN">Perempuan</option>
              </Select>
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
            <Field label="Perusahaan" required>
              <Select
                value={form.companyId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    companyId: e.target.value,
                    departmentId: "",
                    divisionId: "",
                    sectionId: "",
                    teamId: "",
                  }))
                }
              >
                <option value="">— Pilih —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Departemen" required>
              <Select
                value={form.departmentId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    departmentId: e.target.value,
                    divisionId: "",
                    sectionId: "",
                    teamId: "",
                  }))
                }
              >
                <option value="">— Pilih —</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Divisi" required>
              <Select
                value={form.divisionId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, divisionId: e.target.value, sectionId: "", teamId: "" }))
                }
              >
                <option value="">— Pilih —</option>
                {divOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seksi" required>
              <Select
                value={form.sectionId}
                onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value, teamId: "" }))}
              >
                <option value="">— Pilih —</option>
                {secOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Regu" required>
              <Select value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
                <option value="">— Pilih —</option>
                {teamOptions.map((t) => (
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

      {histOpen && histEmp && (
        <Modal title={`Riwayat — ${histEmp.name}`} onClose={() => setHistOpen(false)} wide>
          {histLoading ? (
            <Spinner />
          ) : histItems.length === 0 ? (
            <EmptyState title="Belum ada riwayat" hint="Perubahan data karyawan akan tercatat di sini." />
          ) : (
            <div className="space-y-2">
              {histItems.map((h) => (
                <div key={h.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-semibold text-slate-900">{h.fieldLabel}</p>
                  <p className="text-slate-600">
                    <span className="line-through text-slate-400">{h.oldLabel ?? "—"}</span>
                    {" → "}
                    <span className="font-semibold text-cyan-700">{h.newLabel ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(h.createdAt).toLocaleString("id-ID")}
                    {h.changedBy && ` · oleh ${h.changedBy}`}
                    {h.effectiveDate && ` · efektif ${h.effectiveDate}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
