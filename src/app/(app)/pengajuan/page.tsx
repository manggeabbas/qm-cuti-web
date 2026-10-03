"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
} from "@/components/ui";
import {
  PENDING_STATUSES,
  fetchJson,
  fmtNum,
  formatDateID,
  groupByPackage,
  type LeaveRequestItem,
} from "@/components/leave-helpers";

const TABS = [
  { key: "ALL", label: "Semua" },
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Diajukan" },
  { key: "APPROVED", label: "Disetujui" },
  { key: "REJECTED", label: "Ditolak" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PengajuanListPage() {
  const [items, setItems] = useState<LeaveRequestItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<TabKey>("ALL");
  const [error, setError] = useState("");

  const LIMIT = 20;

  useEffect(() => {
    setItems(null);
    setError("");
    (async () => {
      const r = await fetchJson<{ items: LeaveRequestItem[]; total: number } | LeaveRequestItem[]>(
        `/api/leave-requests?page=${page}&limit=${LIMIT}`
      );
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      if (Array.isArray(r.data)) {
        setItems(r.data);
        setTotal(r.data.length);
      } else {
        setItems(r.data.items);
        setTotal(r.data.total);
      }
    })();
  }, [page]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (tab === "ALL") return items;
    if (tab === "SUBMITTED") return items.filter((i) => PENDING_STATUSES.includes(i.status));
    return items.filter((i) => i.status === tab);
  }, [items, tab]);

  const groups = useMemo(() => groupByPackage(filtered), [filtered]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pengajuan Saya"
        subtitle="Daftar pengajuan cuti dan izin milik Anda."
        action={
          <Link href="/pengajuan/baru">
            <Button className="!px-3">+ Baru</Button>
          </Link>
        }
      />

      {/* Filter status */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-cyan-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {items === null && !error ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Tidak ada pengajuan"
          hint={
            tab === "ALL"
              ? "Belum ada pengajuan. Buat pengajuan baru dengan tombol + Baru."
              : "Tidak ada pengajuan dengan status ini."
          }
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Link key={g.key} href={`/pengajuan/${g.primaryId}`}>
              <Card className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {g.isPackage && <span className="mr-1">📦</span>}
                    {g.title}
                  </p>
                  <Badge status={g.status} />
                </div>
                <p className="text-sm text-slate-600">
                  {formatDateID(g.startDate)} – {formatDateID(g.endDate)} ·{" "}
                  {fmtNum(g.totalDays)} hari
                </p>
                {g.isPackage && (
                  <div className="space-y-0.5 pt-0.5">
                    {g.parts.map((p) => (
                      <p key={p.id} className="text-xs text-slate-500">
                        · {p.leaveType.name}: {formatDateID(p.startDate)} –{" "}
                        {formatDateID(p.endDate)} ({fmtNum(p.totalDays)} hari)
                      </p>
                    ))}
                  </div>
                )}
                {g.reason && (
                  <p className="truncate text-xs text-slate-500">“{g.reason}”</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Paginasi */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Sebelumnya
          </Button>
          <p className="text-sm text-slate-500">
            Hal {page} / {totalPages}
          </p>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya ›
          </Button>
        </div>
      )}
    </div>
  );
}
