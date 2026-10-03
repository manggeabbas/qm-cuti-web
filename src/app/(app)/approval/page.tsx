"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Badge, Spinner, EmptyState, PageHeader, ErrorBox, Textarea } from "@/components/ui";
import Modal from "@/components/Modal";
import { formatID } from "@/lib/dates-client";

interface InboxItem {
  id: number;
  employee: { name: string; nik: string; team: { name: string } };
  leaveType: { name: string };
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  stepRole: string;
}

export default function ApprovalPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/approvals/inbox");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setItems(j.data.items ?? j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(action: "approve" | "reject" | "return") {
    if (!selected) return;
    if (action === "reject" && !comment.trim()) {
      setError("Alasan penolakan wajib diisi.");
      return;
    }
    setActing(true);
    setError("");
    try {
      const r = await fetch(`/api/leave-requests/${selected.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setSelected(null);
      setComment("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <PageHeader title="Approval" subtitle="Pengajuan yang menunggu persetujuan Anda" />
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Tidak ada pengajuan menunggu" hint="Semua pengajuan sudah diproses." />
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{it.employee.name}</p>
                  <p className="text-xs text-slate-500">{it.employee.nik} · {it.employee.team.name}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {it.leaveType.name} · {formatID(it.startDate)} – {formatID(it.endDate)} ({it.totalDays} hari)
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 italic">“{it.reason}”</p>
                </div>
                <Badge status={it.status} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setSelected(it); setComment(""); setError(""); }}>
                  Periksa
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Modal title="Keputusan Approval" onClose={() => setSelected(null)}>
          <ErrorBox message={error} />
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">{selected.employee.name}</p>
              <p className="text-xs text-slate-500">{selected.employee.nik} · {selected.employee.team.name}</p>
            </div>
            <Badge status={selected.status} />
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium">{selected.leaveType.name} · {selected.totalDays} hari</p>
            <p className="text-xs text-slate-500">{formatID(selected.startDate)} – {formatID(selected.endDate)}</p>
            {selected.reason && (
              <p className="mt-1 text-xs italic text-slate-500">“{selected.reason}”</p>
            )}
          </div>
          <div className="mt-3">
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Catatan / alasan (wajib untuk penolakan)" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button disabled={acting} onClick={() => act("approve")}>Setujui</Button>
            <Button disabled={acting} variant="danger" onClick={() => act("reject")}>Tolak</Button>
            <Button disabled={acting} variant="secondary" onClick={() => act("return")}>Revisi</Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Link href={`/pengajuan/${selected.id}`} className="text-xs font-semibold text-cyan-700 hover:underline">
              Lihat detail lengkap ›
            </Link>
            <Button variant="ghost" onClick={() => setSelected(null)}>Batal</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
