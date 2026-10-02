"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
} from "@/components/ui";
import {
  fetchJson,
  fmtNum,
  formatDateID,
  type LeaveBalance,
  type MeEmployee,
  type MeUser,
} from "@/components/leave-helpers";

interface EmployeeDetail extends MeEmployee {
  positionName?: string;
  teamName?: string;
  effectiveDate?: string | null;
  joinDate?: string | null;
  phone?: string | null;
  status?: string;
}

export default function ProfilPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      const rMe = await fetchJson<{ user: MeUser }>("/api/auth/me");
      if (!rMe.ok) {
        setError(rMe.error.message);
        return;
      }
      const user = rMe.data.user;
      setMe(user);

      const year = new Date().getFullYear();
      const empId = user.employee?.id;

      const [rBal, rEmp] = await Promise.all([
        fetchJson<{ balances: LeaveBalance[] } | LeaveBalance[]>(
          `/api/leave-balances?${empId ? `employeeId=${empId}&` : ""}year=${year}`
        ),
        empId
          ? fetchJson<EmployeeDetail>(`/api/employees/${empId}`)
          : Promise.resolve({ ok: true as const, data: null as EmployeeDetail | null }),
      ]);
      if (rBal.ok) {
        const d = rBal.data;
        setBalances(Array.isArray(d) ? d : (d.balances ?? []));
      } else setError(rBal.error.message);
      if (rEmp.ok && rEmp.data) setDetail(rEmp.data);
    })();
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!me && !error) return <Spinner />;
  if (!me) return <ErrorBox message={error || "Gagal memuat profil."} />;

  const emp: EmployeeDetail | null = detail ?? me.employee;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Profil Saya" subtitle="Data diri dan saldo cuti Anda." />
      {error && <ErrorBox message={error} />}

      {/* Data diri */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            👤
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">
              {emp?.name ?? me.username}
            </p>
            <p className="text-sm text-slate-500">@{me.username}</p>
            <p className="text-xs text-slate-400">{me.roles.join(", ")}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="NIK" value={emp?.nik} />
          <Info label="Jabatan" value={emp?.positionCode} />
          <Info label="Regu" value={emp?.teamCode} />
          <Info label="Status" value={emp?.status} />
          <Info label="Tanggal efektif" value={formatDateID(emp?.effectiveDate)} />
          <Info label="Telepon" value={emp?.phone} />
        </div>
      </Card>

      {/* Saldo cuti */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Saldo cuti {new Date().getFullYear()}
        </h2>
        {!balances ? (
          <Spinner />
        ) : balances.length === 0 ? (
          <EmptyState title="Belum ada saldo" hint="Saldo cuti Anda belum dialokasikan." />
        ) : (
          <div className="space-y-2">
            {balances.map((b) => (
              <Card key={b.leaveType.code}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-bold text-slate-900">{b.leaveType.name}</p>
                  <p className="text-xs text-slate-500">{b.leaveType.code}</p>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[11px] uppercase text-slate-500">Hak</p>
                    <p className="font-bold text-slate-900">{fmtNum(b.allocated)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[11px] uppercase text-slate-500">Terpakai</p>
                    <p className="font-bold text-slate-900">{fmtNum(b.used)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[11px] uppercase text-slate-500">Pending</p>
                    <p className="font-bold text-slate-900">{fmtNum(b.pending ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2">
                    <p className="text-[11px] uppercase text-emerald-700">Tersedia</p>
                    <p className="font-bold text-emerald-800">{fmtNum(b.available ?? 0)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Button variant="danger" className="w-full" disabled={loggingOut} onClick={logout}>
        {loggingOut ? "Keluar…" : "🚪 Keluar"}
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="font-medium text-slate-900">{value || "—"}</p>
    </div>
  );
}
