"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
  Stat,
} from "@/components/ui";
import {
  PENDING_STATUSES,
  fetchJson,
  fmtNum,
  formatDateID,
  hasRole,
  type LeaveBalance,
  type LeaveRequestItem,
  type MeUser,
} from "@/components/leave-helpers";

const APPROVER_ROLES = ["FOREMAN", "WAFOR", "KOORDINATOR", "SPV"];

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function isThisMonth(item: LeaveRequestItem): boolean {
  const ts = item.submittedAt ?? item.createdAt;
  if (!ts) return true; // API tidak mengirim waktu → hitung semua
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function DashboardPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequestItem[] | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [empTotal, setEmpTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const loading = !me || !balances || !requests;

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
      const [rBal, rReq] = await Promise.all([
        fetchJson<LeaveBalance[]>(
          `/api/leave-balances?${empId ? `employeeId=${empId}&` : ""}year=${year}`
        ),
        fetchJson<{ items: LeaveRequestItem[]; total: number } | LeaveRequestItem[]>(
          "/api/leave-requests?page=1&limit=100"
        ),
      ]);
      if (rBal.ok) setBalances(rBal.data);
      else setError(rBal.error.message);
      if (rReq.ok) {
        const items = Array.isArray(rReq.data) ? rReq.data : rReq.data.items;
        setRequests(items);
      } else setError(rReq.error.message);

      const isApprover = hasRole(user, ...APPROVER_ROLES);
      const isAdmin = hasRole(user, "ADMIN");
      if (isApprover || isAdmin) {
        const rInbox = await fetchJson<unknown[]>("/api/approvals/inbox");
        if (rInbox.ok) {
          const d = rInbox.data as { items?: unknown[] } | unknown[];
          setInboxCount(Array.isArray(d) ? d.length : (d.items?.length ?? 0));
        }
      }
      if (isAdmin) {
        const rEmp = await fetchJson<{ total?: number; items?: unknown[] } | unknown[]>(
          "/api/employees?limit=1"
        );
        if (rEmp.ok) {
          const d = rEmp.data;
          setEmpTotal(Array.isArray(d) ? d.length : (d.total ?? d.items?.length ?? 0));
        }
      }
    })();
  }, []);

  const balanceOf = (code: string) => balances?.find((b) => b.leaveType.code === code);

  const thisMonth = (requests ?? []).filter(isThisMonth);
  const cntPending = thisMonth.filter((r) => PENDING_STATUSES.includes(r.status)).length;
  const cntApproved = thisMonth.filter((r) => r.status === "APPROVED").length;
  const cntRejected = thisMonth.filter((r) => r.status === "REJECTED").length;

  if (loading && !error) return <Spinner />;
  if (!me) return <ErrorBox message={error || "Gagal memuat data pengguna."} />;

  const isApprover = hasRole(me, ...APPROVER_ROLES);
  const isAdmin = hasRole(me, "ADMIN");
  const recent = (requests ?? []).slice(0, 5);

  const actions = [
    { href: "/pengajuan/baru?tipe=cuti", icon: "🏖️", label: "Ajukan Cuti" },
    { href: "/pengajuan/baru?tipe=izin", icon: "📝", label: "Ajukan Izin" },
    { href: "/pengajuan", icon: "📜", label: "Riwayat" },
    { href: "/kalender", icon: "📅", label: "Kalender" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Halo, ${me.employee?.name ?? me.username} 👋`}
        subtitle="Selamat datang di aplikasi pengajuan cuti QM YWI."
      />
      {error && <ErrorBox message={error} />}

      {/* Profil singkat */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
            👤
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{me.employee?.name ?? me.username}</p>
            <p className="text-sm text-slate-500">
              NIK {me.employee?.nik ?? "—"} · {me.employee?.positionCode ?? "—"} · Regu{" "}
              {me.employee?.teamCode ?? "—"}
            </p>
            <p className="text-xs text-slate-400">{me.roles.join(", ")}</p>
          </div>
        </div>
      </Card>

      {/* Aksi cepat */}
      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition active:scale-[0.98]"
          >
            <span className="text-2xl">{a.icon}</span>
            <span className="text-xs font-semibold text-slate-700">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Saldo CFV & CT */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["CFV", "CT"] as const).map((code) => {
          const b = balanceOf(code);
          if (!b) return null;
          return (
            <Card key={code}>
              <div className="flex items-baseline justify-between">
                <p className="font-bold text-slate-900">Saldo {b.leaveType.name}</p>
                <p className="text-xs text-slate-500">{code}</p>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <MiniStat label="Hak" value={fmtNum(b.allocated)} />
                <MiniStat label="Terpakai" value={fmtNum(b.used)} />
                <MiniStat label="Pending" value={fmtNum(b.pending ?? 0)} />
                <MiniStat label="Tersedia" value={fmtNum(b.available ?? 0)} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Statistik bulan ini */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Pengajuan bulan ini
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Menunggu" value={String(cntPending)} sub="Diajukan / proses approval" />
          <Stat label="Disetujui" value={String(cntApproved)} sub="Sudah disetujui" />
          <Stat label="Ditolak" value={String(cntRejected)} sub="Ditolak approver" />
        </div>
      </div>

      {/* Menunggu approval (approver) */}
      {isApprover && (
        <Link href="/approval">
          <Card className="flex items-center justify-between border-amber-200 bg-amber-50">
            <div>
              <p className="font-bold text-amber-900">✅ Menunggu Approval</p>
              <p className="text-sm text-amber-700">
                {inboxCount === null ? "Memuat…" : `${inboxCount} pengajuan menunggu keputusan Anda`}
              </p>
            </div>
            <span className="text-2xl">›</span>
          </Card>
        </Link>
      )}

      {/* Ringkasan admin */}
      {isAdmin && (
        <Card>
          <p className="font-bold text-slate-900">📊 Ringkasan Admin</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniStat label="Karyawan aktif" value={empTotal === null ? "…" : String(empTotal)} />
            <MiniStat
              label="Menunggu approval"
              value={inboxCount === null ? "…" : String(inboxCount)}
            />
          </div>
        </Card>
      )}

      {/* Pengajuan terbaru */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Pengajuan terbaru
          </h2>
          <Link href="/pengajuan" className="text-sm font-semibold text-emerald-700">
            Lihat semua ›
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" hint="Ajukan cuti atau izin pertama Anda." />
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <Link key={r.id} href={`/pengajuan/${r.id}`}>
                <Card className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {r.leaveType.name} · {fmtNum(r.totalDays)} hari
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateID(r.startDate)} – {formatDateID(r.endDate)}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="pb-2">
        <Link href="/pengajuan/baru">
          <Button className="w-full">+ Pengajuan Baru</Button>
        </Link>
      </div>
    </div>
  );
}
