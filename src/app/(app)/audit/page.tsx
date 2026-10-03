"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, Input, Field, PageHeader, Spinner, EmptyState, ErrorBox } from "@/components/ui";
import Pager from "@/components/Pager";
import { api, Paged } from "@/lib/client-api";

interface AuditItem {
  id: number;
  createdAt: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValue: unknown;
  newValue: unknown;
}

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  CREATE_EMPLOYEE: "Buat karyawan",
  UPDATE_EMPLOYEE: "Ubah karyawan",
  DEACTIVATE_EMPLOYEE: "Nonaktifkan karyawan",
  CREATE_COMPANY: "Buat perusahaan",
  UPDATE_COMPANY: "Ubah perusahaan",
  DELETE_COMPANY: "Hapus perusahaan",
  CREATE_DIVISION: "Buat divisi",
  UPDATE_DIVISION: "Ubah divisi",
  DELETE_DIVISION: "Hapus divisi",
  CREATE_DEPARTMENT: "Buat departemen",
  UPDATE_DEPARTMENT: "Ubah departemen",
  DELETE_DEPARTMENT: "Hapus departemen",
  CREATE_SECTION: "Buat seksi",
  UPDATE_SECTION: "Ubah seksi",
  DELETE_SECTION: "Hapus seksi",
  CREATE_TEAM: "Buat regu",
  UPDATE_TEAM: "Ubah regu",
  DELETE_TEAM: "Hapus regu",
  CREATE_POSITION: "Buat jabatan",
  UPDATE_POSITION: "Ubah jabatan",
  DELETE_POSITION: "Hapus jabatan",
  CREATE_LEAVE_TYPE: "Buat jenis cuti",
  UPDATE_LEAVE_TYPE: "Ubah jenis cuti",
  DELETE_LEAVE_TYPE: "Hapus jenis cuti",
  CREATE_HOLIDAY: "Buat hari libur",
  UPDATE_HOLIDAY: "Ubah hari libur",
  DELETE_HOLIDAY: "Hapus hari libur",
  CREATE_USER: "Buat pengguna",
  UPDATE_USER: "Ubah pengguna",
  RESET_PASSWORD: "Reset password",
  DEACTIVATE_USER: "Nonaktifkan pengguna",
  CHANGE_SETTING: "Ubah pengaturan",
  CREATE_LEAVE_REQUEST: "Buat pengajuan",
  APPROVE: "Setujui",
  REJECT: "Tolak",
  CANCEL: "Batalkan",
  CHANGE_BALANCE: "Ubah saldo",
  SEND_NOTIFICATION: "Kirim notifikasi",
};

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (action.trim()) params.set("action", action.trim());
      if (entityType.trim()) params.set("entityType", entityType.trim());
      if (q.trim()) params.set("search", q.trim());
      const d = await api<Paged<AuditItem>>(`/api/admin/audit-logs?${params}`);
      setItems(d.items);
      setTotalPages(d.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType, q]);

  useEffect(() => {
    load();
  }, [load]);

  function resetPage() {
    setPage(1);
  }

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Jejak aktivitas pengguna sistem" />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Aksi">
            <Input
              placeholder="cth. CREATE_EMPLOYEE"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Tipe Entitas">
            <Input
              placeholder="cth. Employee"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Cari (aksi / username)">
            <Input
              placeholder="kata kunci…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetPage();
              }}
            />
          </Field>
        </div>
      </Card>

      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Tidak ada data audit" hint="Ubah filter untuk melihat data lain." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Entitas</th>
                <th className="px-4 py-3">Pengguna</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <React.Fragment key={it.id}>
                  <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(it.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{ACTION_LABEL[it.action] ?? it.action}</td>
                    <td className="px-4 py-3 text-xs">
                      {it.entityType ?? "-"}
                      {it.entityId ? ` #${it.entityId}` : ""}
                    </td>
                    <td className="px-4 py-3">{it.username ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        {expanded === it.id ? "Tutup" : "Lihat"}
                      </button>
                    </td>
                  </tr>
                  {expanded === it.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <p className="font-semibold text-slate-600">IP: {it.ipAddress ?? "-"}</p>
                            <p className="mt-1 break-all text-slate-500">{it.userAgent ?? ""}</p>
                          </div>
                          <div className="space-y-2">
                            {it.oldValue != null && (
                              <div>
                                <p className="font-semibold text-slate-600">Sebelum:</p>
                                <pre className="overflow-x-auto rounded-lg bg-white p-2 text-[11px]">
                                  {JSON.stringify(it.oldValue, null, 2)}
                                </pre>
                              </div>
                            )}
                            {it.newValue != null && (
                              <div>
                                <p className="font-semibold text-slate-600">Sesudah:</p>
                                <pre className="overflow-x-auto rounded-lg bg-white p-2 text-[11px]">
                                  {JSON.stringify(it.newValue, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
