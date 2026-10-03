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
import { SHIFT_CELL, shiftCategory } from "@/lib/shift-colors";

const APPROVER_ROLES = ["FOREMAN", "WAFOR", "KOORDINATOR", "WSPV", "SPV"];

interface MyShift {
  team: { code: string; name: string } | null;
  from: string | null;
  to: string | null;
  today: string;
  items: { date: string; shift: { code: string; name: string; startTime: string | null; endTime: string | null } }[];
}

const DOW_SHORT = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];

function eachISO(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

function isThisMonth(item: LeaveRequestItem): boolean {
  const ts = item.submittedAt ?? item.createdAt;
  if (!ts) return true;
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

const QUICK_ACTIONS = [
  { href: "/pengajuan/baru?tipe=cuti", icon: "🏖️", label: "Ajukan Cuti" },
  { href: "/pengajuan/baru?tipe=izin", icon: "📝", label: "Ajukan Izin" },
  { href: "/pengajuan", icon: "📜", label: "Riwayat" },
  { href: "/kalender", icon: "📅", label: "Kalender" },
];

export default function DashboardPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequestItem[] | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [empTotal, setEmpTotal] = useState<number | null>(null);
  const [myShift, setMyShift] = useState<MyShift | null>(null);
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
        fetchJson<{ balances: LeaveBalance[] } | LeaveBalance[]>(
          `/api/leave-balances?${empId ? `employeeId=${empId}&` : ""}year=${year}`
        ),
        fetchJson<{ items: LeaveRequestItem[]; total: number } | LeaveRequestItem[]>(
          "/api/leave-requests?page=1&limit=100"
        ),
      ]);
      if (rBal.ok) {
        const d = rBal.data;
        setBalances(Array.isArray(d) ? d : (d.balances ?? []));
      } else setError(rBal.error.message);
      if (rReq.ok) {
        const items = Array.isArray(rReq.data) ? rReq.data : rReq.data.items;
        setRequests(items);
      } else setError(rReq.error.message);

      const rShift = await fetchJson<MyShift>("/api/shifts/my");
      if (rShift.ok) setMyShift(rShift.data);

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
  const ctAvailable = balanceOf("CT")?.available;

  const todayShift = myShift?.items.find((i) => i.date === myShift.today)?.shift ?? null;
  const shiftByDate = new Map((myShift?.items ?? []).map((i) => [i.date, i.shift]));
  const weekDays = myShift?.from && myShift.to ? eachISO(myShift.from, myShift.to) : [];
  const todayCat =
    todayShift && myShift
      ? shiftCategory({
          code: todayShift.code,
          dayOfWeek: new Date(`${myShift.today}T00:00:00Z`).getUTCDay(),
          startTime: todayShift.startTime,
          endTime: todayShift.endTime,
        })
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Halo, ${me.employee?.name ?? me.username} 👋`}
        subtitle="Selamat datang di aplikasi pengajuan cuti TTRI."
        breadcrumb={me.employee ? `NIK ${me.employee.nik} · ${me.employee.positionCode ?? "-"} · Regu ${me.employee.teamCode ?? "-"}` : undefined}
      />
      {error && <ErrorBox message={error} />}

      {/* Statistik bulan ini */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ringkasan bulan ini
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Menunggu" value={String(cntPending)} sub="Proses approval" icon="🕓" tone="amber" />
          <Stat label="Disetujui" value={String(cntApproved)} sub="Bulan ini" icon="✅" tone="emerald" />
          <Stat label="Ditolak" value={String(cntRejected)} sub="Bulan ini" icon="⛔" tone="red" />
          <Stat
            label="Saldo CT"
            value={ctAvailable == null ? "—" : fmtNum(ctAvailable)}
            sub="Hari tersedia"
            icon="🏖️"
            tone="blue"
          />
        </div>
      </div>

      {/* Aksi cepat */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi cepat</h2>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40 active:scale-[0.98]"
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="text-xs font-semibold text-slate-700">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Shift saya */}
      {me.employee && (
        <Card title="Shift Saya" description={myShift?.team ? `Regu ${myShift.team.name}` : undefined}>
          {myShift?.team && weekDays.length > 0 ? (
            <>
          <div className="flex items-center gap-3">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                todayCat ? SHIFT_CELL[todayCat] : "bg-slate-100 text-slate-500"
              }`}
            >
              {todayShift ? todayShift.code.slice(0, 3) : "OFF"}
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500">Hari ini</p>
              <p className="font-semibold text-slate-900">
                {todayShift
                  ? `${todayShift.name}${todayShift.startTime ? ` · ${todayShift.startTime}–${todayShift.endTime}` : ""}`
                  : new Date(`${myShift.today}T00:00:00Z`).getUTCDay() === 3
                    ? "OFF Bersama (Rabu)"
                    : "Belum ada jadwal shift"}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {weekDays.map((iso) => {
              const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
              const shift = shiftByDate.get(iso);
              const isWed = dow === 3;
              const isToday = iso === myShift.today;
              const cat = shiftCategory({
                code: shift?.code,
                dayOfWeek: dow,
                startTime: shift?.startTime,
                endTime: shift?.endTime,
              });
              return (
                <div
                  key={iso}
                  className={`rounded-lg border p-1 text-center ${
                    isToday ? "border-emerald-400 bg-emerald-50/60" : "border-slate-100"
                  }`}
                  title={shift ? `${shift.name} ${shift.startTime ?? ""}–${shift.endTime ?? ""}` : undefined}
                >
                  <p className="text-[10px] font-medium text-slate-400">{DOW_SHORT[dow]}</p>
                  <p className="text-[11px] font-semibold text-slate-700">{Number(iso.slice(8, 10))}</p>
                  <p
                    className={`mt-0.5 rounded px-0.5 py-0.5 text-[9px] font-bold ${
                      cat ? SHIFT_CELL[cat] : isWed ? "bg-slate-100 text-slate-400" : "text-slate-300"
                    }`}
                  >
                    {shift ? shift.code.slice(0, 3) : isWed ? "OFF" : "·"}
                  </p>
                </div>
              );
            })}
          </div>
            </>
          ) : (
            <EmptyState
              title="Jadwal shift belum tersedia"
              hint="Minta admin membuat jadwal shift untuk regu Anda."
              icon="🕐"
            />
          )}
        </Card>
      )}

      {/* Saldo CFV & CT */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["CFV", "CT"] as const).map((code) => {
          const b = balanceOf(code);
          if (!b) return null;
          return (
            <Card key={code} title={`Saldo ${b.leaveType.name}`} description={code}>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Hak</p>
                  <p className="text-base font-bold text-slate-900">{fmtNum(b.allocated)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Terpakai</p>
                  <p className="text-base font-bold text-slate-900">{fmtNum(b.used)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Pending</p>
                  <p className="text-base font-bold text-slate-900">{fmtNum(b.pending ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-[11px] font-medium uppercase text-emerald-700">Tersedia</p>
                  <p className="text-base font-bold text-emerald-800">{fmtNum(b.available ?? 0)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Menunggu approval (approver) */}
      {isApprover && (
        <Link href="/approval" className="block">
          <Card className="flex items-center justify-between border-amber-200 bg-amber-50/70 transition hover:border-amber-300">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-lg">✅</span>
              <div>
                <p className="font-semibold text-amber-900">Menunggu Approval</p>
                <p className="text-sm text-amber-700">
                  {inboxCount === null ? "Memuat…" : `${inboxCount} pengajuan menunggu keputusan Anda`}
                </p>
              </div>
            </div>
            <span className="text-xl text-amber-700">›</span>
          </Card>
        </Link>
      )}

      {/* Ringkasan admin */}
      {isAdmin && (
        <Card title="Ringkasan Admin" description="Kondisi data saat ini">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">Karyawan aktif</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{empTotal === null ? "…" : empTotal}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">Menunggu approval</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{inboxCount === null ? "…" : inboxCount}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Pengajuan terbaru */}
      <Card
        title="Pengajuan terbaru"
        action={
          <Link href="/pengajuan" className="text-xs font-semibold text-emerald-700 hover:underline">
            Lihat semua ›
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="Belum ada pengajuan"
            hint="Ajukan cuti atau izin pertama Anda."
            icon="🗓️"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/pengajuan/${r.id}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {r.leaveType.name} · {fmtNum(r.totalDays)} hari
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateID(r.startDate)} – {formatDateID(r.endDate)}
                  </p>
                </div>
                <Badge status={r.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="pb-2 sm:pb-0">
        <Link href="/pengajuan/baru">
          <Button className="w-full sm:w-auto">+ Pengajuan Baru</Button>
        </Link>
      </div>
    </div>
  );
}
