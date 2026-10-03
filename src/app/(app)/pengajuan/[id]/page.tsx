"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  PageHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import {
  CANCELLABLE_STATUSES,
  fetchJson,
  fmtNum,
  formatDateID,
  formatDateTimeID,
  type LeaveRequestItem,
} from "@/components/leave-helpers";

interface ApprovalItem {
  id: number;
  approverName?: string;
  approver?: { name?: string };
  role?: string;
  stepRole?: string;
  action?: string;
  status?: string;
  note?: string | null;
  createdAt?: string | null;
}

interface ConflictItem {
  type: string;
  severity: string;
  description: string;
}

interface RequestDetail extends Omit<LeaveRequestItem, "leaveType"> {
  leaveType: { name: string; code: string; category: string };
  addressDuringLeave?: string | null;
  contactNumber?: string | null;
  notes?: string | null;
  packageId?: string | null;
  packageOrder?: number | null;
  packageParts?: Array<{
    id: number;
    packageOrder: number | null;
    status: string;
    startDate: string;
    endDate: string;
    totalDays: number | string;
    leaveType: { id: number; code: string; name: string };
  }> | null;
  cancelReason?: string | null;
  decidedAt?: string | null;
  approvals?: ApprovalItem[];
  conflicts?: ConflictItem[];
  employee?: { name?: string; nik?: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  RETURNED: "Dikembalikan",
  PENDING: "Menunggu",
};

function approvalName(a: ApprovalItem): string {
  return a.approverName ?? a.approver?.name ?? "—";
}

export default function PengajuanDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [data, setData] = useState<RequestDetail | null>(null);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState("");

  async function load() {
    const r = await fetchJson<RequestDetail>(`/api/leave-requests/${id}`);
    if (!r.ok) setError(r.error.message);
    else setData(r.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setCancelErr("Alasan pembatalan wajib diisi.");
      return;
    }
    setCancelErr("");
    setCancelBusy(true);
    const r = await fetchJson(`/api/leave-requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: cancelReason.trim() }),
    });
    setCancelBusy(false);
    if (!r.ok) {
      setCancelErr(r.error.message);
      return;
    }
    setCancelOpen(false);
    setCancelReason("");
    await load();
  }

  if (!data && !error) return <Spinner />;
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Detail Pengajuan" />
        <ErrorBox message={error || "Data tidak ditemukan."} />
        <Link href="/pengajuan">
          <Button variant="secondary">Kembali</Button>
        </Link>
      </div>
    );
  }

  const canCancel = CANCELLABLE_STATUSES.includes(data.status);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={`Pengajuan #${data.id}`}
        subtitle={data.leaveType.name}
        action={<Badge status={data.status} />}
      />

      {/* Info utama */}
      <Card className="space-y-2">
        <Row label="Jenis" value={`${data.leaveType.name} (${data.leaveType.code})`} />
        <Row
          label="Periode"
          value={`${formatDateID(data.startDate)} – ${formatDateID(data.endDate)}`}
        />
        <Row label="Jumlah hari" value={`${fmtNum(data.totalDays)} hari`} />
        <Row label="Alasan" value={data.reason || "—"} />
        <Row label="Alamat selama cuti" value={data.addressDuringLeave || "—"} />
        <Row label="Nomor kontak" value={data.contactNumber || "—"} />
        <Row label="Catatan" value={data.notes || "—"} />
        {data.packageId && (
          <Row
            label="Paket"
            value={`CFV+CT${data.packageOrder ? ` · bagian ${data.packageOrder} dari 2` : ""}`}
          />
        )}
        {data.packageParts && data.packageParts.length > 1 && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
            <p className="mb-1.5 text-sm font-bold text-slate-900">
              📦 Paket {data.packageParts.map((p) => p.leaveType.code).join(" + ")}
            </p>
            <div className="space-y-1">
              {data.packageParts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">
                    {p.leaveType.name}: {formatDateID(p.startDate)} – {formatDateID(p.endDate)} (
                    {fmtNum(p.totalDays)} hari)
                    {p.id === data.id && <span className="ml-1 font-semibold text-cyan-700">← ini</span>}
                  </span>
                  <Badge status={p.status} />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Keputusan approval berlaku untuk seluruh bagian paket sekaligus.
            </p>
          </div>
        )}
        {data.decidedAt && <Row label="Diputuskan" value={formatDateTimeID(data.decidedAt)} />}
        {data.cancelReason && <Row label="Alasan pembatalan" value={data.cancelReason} />}
      </Card>

      {/* Konflik */}
      {data.conflicts && data.conflicts.length > 0 && (
        <Card>
          <p className="mb-2 font-bold text-slate-900">⚠️ Konflik Terdeteksi</p>
          <div className="space-y-2">
            {data.conflicts.map((c, i) => (
              <div
                key={i}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  c.severity === "BLOCK"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-semibold">{c.type}</p>
                <p>{c.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline approval */}
      <Card>
        <p className="mb-3 font-bold text-slate-900">Riwayat Persetujuan</p>
        {!data.approvals || data.approvals.length === 0 ? (
          <EmptyState title="Belum ada riwayat" hint="Pengajuan belum diproses approver." />
        ) : (
          <ol className="space-y-3">
            {data.approvals.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      a.action === "APPROVED" || a.status === "APPROVED"
                        ? "bg-cyan-500"
                        : a.action === "REJECTED" || a.status === "REJECTED"
                          ? "bg-red-500"
                          : "bg-amber-400"
                    }`}
                  />
                  <div className="w-px flex-1 bg-slate-200" />
                </div>
                <div className="pb-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {approvalName(a)}
                    {(a.role || a.stepRole) && (
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        · {a.role ?? a.stepRole}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    {ACTION_LABEL[a.action ?? a.status ?? ""] ?? (a.action ?? a.status ?? "—")}
                    {a.createdAt ? ` · ${formatDateTimeID(a.createdAt)}` : ""}
                  </p>
                  {a.note && <p className="mt-0.5 text-xs text-slate-500">“{a.note}”</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Aksi */}
      <div className="flex gap-2 pb-2">
        <Link href="/pengajuan">
          <Button variant="secondary">Kembali</Button>
        </Link>
        {canCancel && !cancelOpen && (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            Batalkan Pengajuan
          </Button>
        )}
      </div>

      {cancelOpen && (
        <Card className="space-y-3 border-red-200">
          <p className="font-bold text-red-800">Batalkan pengajuan ini?</p>
          {cancelErr && <ErrorBox message={cancelErr} />}
          <Field label="Alasan pembatalan" required>
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Tulis alasan pembatalan…"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={cancelBusy}
              onClick={() => {
                setCancelOpen(false);
                setCancelReason("");
                setCancelErr("");
              }}
            >
              Urungkan
            </Button>
            <Button variant="danger" className="flex-1" disabled={cancelBusy} onClick={handleCancel}>
              {cancelBusy ? "Memproses…" : "Ya, Batalkan"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
