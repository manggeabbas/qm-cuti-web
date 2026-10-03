"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Select,
  Field,
  PageHeader,
  Spinner,
  ErrorBox,
} from "@/components/ui";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import Pager from "@/components/Pager";
import { api, Paged } from "@/lib/client-api";

interface OrgItem {
  id: number;
  code: string;
  name: string;
  parent: { id: number; code: string; name: string } | null;
  isActive: boolean;
}

interface TabDef {
  key: string;
  label: string;
  endpoint: string;
  parentEndpoint: string | null;
  parentLabel: string;
  parentKey: string | null; // penanda ada/tidaknya induk pada form
}

const TABS: TabDef[] = [
  { key: "companies", label: "Perusahaan", endpoint: "/api/org/companies", parentEndpoint: null, parentLabel: "", parentKey: null },
  { key: "departments", label: "Departemen", endpoint: "/api/org/departments", parentEndpoint: "/api/org/companies", parentLabel: "Perusahaan", parentKey: "companyId" },
  { key: "divisions", label: "Divisi", endpoint: "/api/org/divisions", parentEndpoint: "/api/org/departments", parentLabel: "Departemen", parentKey: "departmentId" },
  { key: "sections", label: "Seksi", endpoint: "/api/org/sections", parentEndpoint: "/api/org/divisions", parentLabel: "Divisi", parentKey: "divisionId" },
  { key: "teams", label: "Regu", endpoint: "/api/org/teams", parentEndpoint: "/api/org/sections", parentLabel: "Seksi", parentKey: "sectionId" },
];

function OrgTab({ tab }: { tab: TabDef }) {
  const [items, setItems] = useState<OrgItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [parents, setParents] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrgItem | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const hasParent = !!tab.parentKey;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("search", q.trim());
      const d = await api<Paged<OrgItem>>(`${tab.endpoint}?${params}`);
      setItems(d.items);
      setTotalPages(d.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [tab.endpoint, page, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab.parentEndpoint) {
      api<Paged<OrgItem>>(`${tab.parentEndpoint}?limit=100`)
        .then((d) => setParents(d.items))
        .catch(() => {});
    }
  }, [tab.parentEndpoint]);

  function openAdd() {
    setEditing(null);
    setCode("");
    setName("");
    setParentId("");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(it: OrgItem) {
    setEditing(it);
    setCode(it.code);
    setName(it.name);
    setParentId(it.parent ? String(it.parent.id) : "");
    setFormError("");
    setModalOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = { code: code.trim(), name: name.trim() };
      if (hasParent) body.parentId = Number(parentId);
      if (editing) {
        await api(`${tab.endpoint}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await api(tab.endpoint, {
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

  async function remove(it: OrgItem) {
    if (!confirm(`Hapus ${tab.label.toLowerCase()} "${it.name}"?`)) return;
    try {
      await api(`${tab.endpoint}/${it.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder={`Cari ${tab.label.toLowerCase()}…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button onClick={openAdd}>+ Tambah {tab.label}</Button>
      </div>

      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          rows={items}
          rowKey={(it) => it.id}
          emptyTitle={`Belum ada ${tab.label.toLowerCase()}`}
          emptyIcon="🏢"
          columns={[
            { key: "code", header: "Kode", render: (it: OrgItem) => <span className="font-mono text-xs">{it.code}</span> },
            { key: "name", header: "Nama", render: (it: OrgItem) => <span className="font-medium text-slate-900">{it.name}</span> },
            ...(tab.parentLabel
              ? [
                  {
                    key: "parent",
                    header: tab.parentLabel,
                    hideOnMobile: true,
                    render: (it: OrgItem) => it.parent?.name ?? "-",
                  },
                ]
              : []),
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
        <Modal title={editing ? `Ubah ${tab.label}` : `Tambah ${tab.label}`} onClose={() => setModalOpen(false)}>
          <ErrorBox message={formError} />
          <div className="space-y-3">
            {tab.parentLabel && (
              <Field label={tab.parentLabel} required>
                <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Kode" required>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="cth. QM_DIV" />
            </Field>
            <Field label="Nama" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
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

export default function OrganisasiPage() {
  const [active, setActive] = useState(TABS[0].key);
  const tab = TABS.find((t) => t.key === active) ?? TABS[0];
  return (
    <div>
      <PageHeader title="Organisasi" subtitle="Struktur perusahaan, departemen, divisi, seksi, dan regu" />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active === t.key ? "bg-cyan-600 text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <OrgTab key={tab.key} tab={tab} />
    </div>
  );
}
