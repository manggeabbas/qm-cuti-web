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
import type { RoleName } from "@prisma/client";

interface AppUser {
  id: number;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: RoleName[];
  employee: { id: number; nik: string; name: string } | null;
  createdAt: string;
}

interface EmpOption {
  id: number;
  nik: string;
  name: string;
}

const ROLES: { value: RoleName; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "SPV", label: "SPV" },
  { value: "WSPV", label: "WSPV" },
  { value: "FOREMAN", label: "Foreman" },
  { value: "WAFOR", label: "Wafor" },
  { value: "KOORDINATOR", label: "Koordinator" },
  { value: "EMPLOYEE", label: "Karyawan" },
];

function roleLabel(r: string) {
  return ROLES.find((x) => x.value === r)?.label ?? r;
}

export default function PenggunaPage() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleName>("EMPLOYEE");
  const [employeeId, setEmployeeId] = useState("");

  const [roleModal, setRoleModal] = useState<AppUser | null>(null);
  const [newRole, setNewRole] = useState<RoleName>("EMPLOYEE");
  const [pwModal, setPwModal] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("search", q.trim());
      const d = await api<Paged<AppUser>>(`/api/admin/users?${params}`);
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
    setUsername("");
    setPassword("");
    setRole("EMPLOYEE");
    setEmployeeId("");
    setFormError("");
    setAddOpen(true);
    api<Paged<EmpOption>>("/api/employees?status=ACTIVE&limit=200")
      .then((d) => setEmployees(d.items))
      .catch(() => {});
  }

  async function submitAdd() {
    setSaving(true);
    setFormError("");
    try {
      await api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          role,
          employeeId: employeeId === "" ? null : Number(employeeId),
        }),
      });
      setAddOpen(false);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function openRoleModal(u: AppUser) {
    setRoleModal(u);
    setNewRole(u.roles[0] ?? "EMPLOYEE");
    setFormError("");
  }

  async function submitRole() {
    if (!roleModal) return;
    setSaving(true);
    setFormError("");
    try {
      await api(`/api/admin/users/${roleModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      setRoleModal(null);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function openPwModal(u: AppUser) {
    setPwModal(u);
    setNewPassword("");
    setFormError("");
  }

  async function submitPassword() {
    if (!pwModal) return;
    setSaving(true);
    setFormError("");
    try {
      await api(`/api/admin/users/${pwModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      setPwModal(null);
      alert("Password berhasil direset.");
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal mereset password.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: AppUser) {
    const target = !u.isActive;
    if (!target && !confirm(`Nonaktifkan pengguna "${u.username}"?`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: target }),
      });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Kelola akun login dan peran pengguna"
        action={<Button onClick={openAdd}>+ Tambah Pengguna</Button>}
      />

      <Card className="mb-4">
        <Field label="Cari username">
          <Input
            placeholder="username…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </Field>
      </Card>

      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada pengguna" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Karyawan</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Login Terakhir</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{u.username}</td>
                  <td className="px-4 py-3">{u.employee ? `${u.employee.name} (${u.employee.nik})` : "-"}</td>
                  <td className="px-4 py-3">{u.roles.map(roleLabel).join(", ")}</td>
                  <td className="px-4 py-3">
                    <Badge status={u.isActive ? "ACTIVE" : "INACTIVE"} label={u.isActive ? "Aktif" : "Nonaktif"} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openRoleModal(u)} className="px-3 py-1.5 text-xs">
                        Role
                      </Button>
                      <Button variant="secondary" onClick={() => openPwModal(u)} className="px-3 py-1.5 text-xs">
                        Reset PW
                      </Button>
                      <Button
                        variant={u.isActive ? "danger" : "secondary"}
                        onClick={() => toggleActive(u)}
                        className="px-3 py-1.5 text-xs"
                      >
                        {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />

      {addOpen && (
        <Modal title="Tambah Pengguna" onClose={() => setAddOpen(false)}>
          <ErrorBox message={formError} />
          <div className="space-y-3">
            <Field label="Username" required>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="biasanya NIK" />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 6 karakter"
              />
            </Field>
            <Field label="Role" required>
              <Select value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Karyawan (opsional)">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">— Tanpa karyawan —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.nik})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={submitAdd} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Modal>
      )}

      {roleModal && (
        <Modal title={`Ubah Role — ${roleModal.username}`} onClose={() => setRoleModal(null)}>
          <ErrorBox message={formError} />
          <Field label="Role baru" required>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value as RoleName)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRoleModal(null)}>
              Batal
            </Button>
            <Button onClick={submitRole} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Modal>
      )}

      {pwModal && (
        <Modal title={`Reset Password — ${pwModal.username}`} onClose={() => setPwModal(null)}>
          <ErrorBox message={formError} />
          <Field label="Password baru" required>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="min. 6 karakter"
            />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwModal(null)}>
              Batal
            </Button>
            <Button onClick={submitPassword} disabled={saving}>
              {saving ? "Menyimpan…" : "Reset"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
