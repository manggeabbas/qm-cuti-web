"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Select,
  Field,
  Badge,
  PageHeader,
  Spinner,
  ErrorBox,
} from "@/components/ui";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import Pager from "@/components/Pager";
import { api, Paged } from "@/lib/client-api";

interface LeaveType {
  id: number;
  code: string;
  name: string;
  category: string;
  defaultDays: number | null;
  eligibilityMonths: number | null;
  maxSingleDays: number | null;
  maxCombinedWithCfv: number | null;
  requiresAttachment: boolean;
  consumesBalance: boolean;
  countsAsLeaveDay: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  countsAsLeaveDay: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  CFV: "CFV",
  CT: "Cuti Tahunan",
  SPECIAL_LEAVE: "Cuti Khusus",
  PERMISSION: "Izin",
};

function LeaveTypeTab() {
  const [items, setItems] = useState<LeaveType[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "CT",
    defaultDays: "",
    eligibilityMonths: "",
    maxSingleDays: "",
    maxCombinedWithCfv: "",
    requiresAttachment: false,
    consumesBalance: true,
    countsAsLeaveDay: true,
    isActive: true,
    sortOrder: "0",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("search", q.trim());
      const d = await api<Paged<LeaveType>>(`/api/leave-types?${params}`);
      setItems(d.items);
      setTotalPages(d.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({
      code: "",
      name: "",
      category: "CT",
      defaultDays: "",
      eligibilityMonths: "",
      maxSingleDays: "",
      maxCombinedWithCfv: "",
      requiresAttachment: false,
      consumesBalance: true,
      countsAsLeaveDay: true,
      isActive: true,
      sortOrder: "0",
    });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(it: LeaveType) {
    setEditing(it);
    setForm({
      code: it.code,
      name: it.name,
      category: it.category,
      defaultDays: it.defaultDays != null ? String(it.defaultDays) : "",
      eligibilityMonths: it.eligibilityMonths != null ? String(it.eligibilityMonths) : "",
      maxSingleDays: it.maxSingleDays != null ? String(it.maxSingleDays) : "",
      maxCombinedWithCfv: it.maxCombinedWithCfv != null ? String(it.maxCombinedWithCfv) : "",
      requiresAttachment: it.requiresAttachment,
      consumesBalance: it.consumesBalance,
      countsAsLeaveDay: it.countsAsLeaveDay,
      isActive: it.isActive,
      sortOrder: String(it.sortOrder),
    });
    setFormError("");
    setModalOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError("");
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v.trim()));
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        defaultDays: num(form.defaultDays),
        eligibilityMonths: num(form.eligibilityMonths),
        maxSingleDays: num(form.maxSingleDays),
        maxCombinedWithCfv: num(form.maxCombinedWithCfv),
        requiresAttachment: form.requiresAttachment,
        consumesBalance: form.consumesBalance,
        countsAsLeaveDay: form.countsAsLeaveDay,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        await api(`/api/leave-types/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/leave-types", {
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

  async function remove(it: LeaveType) {
    if (!confirm(`Hapus jenis cuti "${it.name}"?`)) return;
    try {
      await api(`/api/leave-types/${it.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cari jenis cuti…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button onClick={openAdd}>+ Tambah</Button>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          rows={items}
          rowKey={(it) => it.id}
          emptyTitle="Belum ada jenis cuti"
          emptyIcon="🗂️"
          columns={[
            { key: "code", header: "Kode", render: (it) => <span className="font-mono text-xs">{it.code}</span> },
            { key: "name", header: "Nama", render: (it) => <span className="font-medium text-slate-900">{it.name}</span> },
            { key: "category", header: "Kategori", render: (it) => CATEGORY_LABEL[it.category] ?? it.category },
            { key: "days", header: "Hak (hari)", hideOnMobile: true, render: (it) => it.defaultDays ?? "-" },
            { key: "elig", header: "Syarat (bln)", hideOnMobile: true, render: (it) => it.eligibilityMonths ?? "-" },
            {
              key: "status",
              header: "Status",
              render: (it) => <Badge status={it.isActive ? "ACTIVE" : "INACTIVE"} label={it.isActive ? "Aktif" : "Nonaktif"} />,
            },
          ]}
          actions={(it) => (
            <>
              <Button size="sm" variant="outline" onClick={() => openEdit(it)}>
                Ubah
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(it)}>
                Hapus
              </Button>
            </>
          )}
        />
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />

      {modalOpen && (
        <Modal title={editing ? "Ubah Jenis Cuti" : "Tambah Jenis Cuti"} onClose={() => setModalOpen(false)} wide>
          <ErrorBox message={formError} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kode" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Nama" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Kategori" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="CFV">CFV</option>
                <option value="CT">Cuti Tahunan</option>
                <option value="SPECIAL_LEAVE">Cuti Khusus</option>
                <option value="PERMISSION">Izin</option>
              </Select>
            </Field>
            <Field label="Urutan Tampil">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </Field>
            <Field label="Hak Default (hari)">
              <Input
                type="number"
                value={form.defaultDays}
                onChange={(e) => setForm({ ...form, defaultDays: e.target.value })}
              />
            </Field>
            <Field label="Syarat Masa Kerja (bulan)">
              <Input
                type="number"
                value={form.eligibilityMonths}
                onChange={(e) => setForm({ ...form, eligibilityMonths: e.target.value })}
              />
            </Field>
            <Field label="Maks Sekali Ambil (hari)">
              <Input
                type="number"
                value={form.maxSingleDays}
                onChange={(e) => setForm({ ...form, maxSingleDays: e.target.value })}
              />
            </Field>
            <Field label="Maks Gabung CFV (hari)">
              <Input
                type="number"
                value={form.maxCombinedWithCfv}
                onChange={(e) => setForm({ ...form, maxCombinedWithCfv: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["requiresAttachment", "Wajib lampiran"],
                ["consumesBalance", "Memotong saldo"],
                ["countsAsLeaveDay", "Dihitung hari cuti"],
                ["isActive", "Aktif"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {label}
              </label>
            ))}
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

function HolidayTab() {
  const [items, setItems] = useState<Holiday[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [countsAsLeaveDay, setCountsAsLeaveDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("search", q.trim());
      const d = await api<Paged<Holiday>>(`/api/holidays?${params}`);
      setItems(d.items);
      setTotalPages(d.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setDate("");
    setName("");
    setCountsAsLeaveDay(false);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(it: Holiday) {
    setEditing(it);
    setDate(it.date);
    setName(it.name);
    setCountsAsLeaveDay(it.countsAsLeaveDay);
    setFormError("");
    setModalOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError("");
    try {
      const body = { date, name: name.trim(), countsAsLeaveDay };
      if (editing) {
        await api(`/api/holidays/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/holidays", {
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

  async function remove(it: Holiday) {
    if (!confirm(`Hapus hari libur "${it.name}" (${it.date})?`)) return;
    try {
      await api(`/api/holidays/${it.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cari hari libur…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button onClick={openAdd}>+ Tambah</Button>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          rows={items}
          rowKey={(it) => it.id}
          emptyTitle="Belum ada hari libur"
          emptyIcon="📅"
          columns={[
            { key: "date", header: "Tanggal", render: (it) => <span className="font-mono text-xs">{it.date}</span> },
            { key: "name", header: "Nama", render: (it) => <span className="font-medium text-slate-900">{it.name}</span> },
            { key: "count", header: "Hitung Hari Cuti", hideOnMobile: true, render: (it) => (it.countsAsLeaveDay ? "Ya" : "Tidak") },
          ]}
          actions={(it) => (
            <>
              <Button size="sm" variant="outline" onClick={() => openEdit(it)}>
                Ubah
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(it)}>
                Hapus
              </Button>
            </>
          )}
        />
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />

      {modalOpen && (
        <Modal title={editing ? "Ubah Hari Libur" : "Tambah Hari Libur"} onClose={() => setModalOpen(false)}>
          <ErrorBox message={formError} />
          <div className="space-y-3">
            <Field label="Tanggal" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Nama" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Hari Raya Idul Fitri" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={countsAsLeaveDay}
                onChange={(e) => setCountsAsLeaveDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Dihitung sebagai hari cuti
            </label>
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

export default function MasterCutiPage() {
  const [active, setActive] = useState<"types" | "holidays">("types");
  return (
    <div>
      <PageHeader title="Master Cuti" subtitle="Jenis cuti dan kalender hari libur" />
      <div className="mb-4 flex gap-2">
        {(
          [
            ["types", "Jenis Cuti"],
            ["holidays", "Hari Libur"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active === k ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {active === "types" ? <LeaveTypeTab /> : <HolidayTab />}
    </div>
  );
}
