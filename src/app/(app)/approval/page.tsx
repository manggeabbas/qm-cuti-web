"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Spinner, EmptyState, PageHeader, ErrorBox, Textarea } from "@/components/ui";
import Modal from "@/components/Modal";
import { formatID } from "@/lib/dates-client";
import { groupByPackage, type RequestGroup } from "@/components/leave-helpers";

interface InboxItem {
  id: number;
  employee: { name: string; nik: string; team: { name: string } };
  leaveType: { name: string; code?: string | null };
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  stepRole: string;
  packageId?: string | null;
  packageOrder?: number | null;
}

type InboxGroup = RequestGroup<InboxItem>;

export default function ApprovalPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InboxGroup | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  const groups = useMemo(() => groupByPackage(items), [items]);

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
      // Keputusan paket: backend menerapkan ke seluruh bagian sekaligus
      const r = await fetch(`/api/leave-requests/${selected.primaryId}/${action}`, {
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
      ) : groups.length === 0 ? (
        <EmptyState title="Tidak ada pengajuan menunggu" hint="Semua pengajuan sudah diproses." />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const head = g.parts[0];
            return (
              <Card key={g.key}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {g.isPackage && <span className="mr-1">📦</span>}
                      {head.employee.name}
                    </p>
                    <p className="text-xs text-slate-500">{head.employee.nik} · {head.employee.team.name}</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">{g.title}</p>
                    {g.isPackage ? (
                      <div className="mt-1 space-y-0.5">
                        {g.parts.map((p) => (
                          <p key={p.id} className="text-xs text-slate-500">
                            · {p.leaveType.name}: {formatID(p.startDate)} – {formatID(p.endDate)} ({p.totalDays} hari)
                          </p>
                        ))}
                        <p className="text-xs font-semibold text-slate-600">
                          Total {g.totalDays} hari · {formatID(g.startDate)} – {formatID(g.endDate)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-700">
                        {head.leaveType.name} · {formatID(head.startDate)} – {formatID(head.endDate)} ({head.totalDays} hari)
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500 italic">“{g.reason}”</p>
                  </div>
                  <Badge status={g.status} />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => { setSelected(g); setComment(""); setError(""); }}>
                    Periksa{g.isPackage ? ` Paket (${g.parts.length} bagian)` : ""}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (() => {
        const head = selected.parts[0];
        return (
          <Modal title={selected.isPackage ? "Keputusan Approval Paket" : "Keputusan Approval"} onClose={() => setSelected(null)}>
            <ErrorBox message={error} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{head.employee.name}</p>
                <p className="text-xs text-slate-500">{head.employee.nik} · {head.employee.team.name}</p>
              </div>
              <Badge status={selected.status} />
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">
                {selected.isPackage && <span className="mr-1">📦</span>}
                {selected.title} · {selected.totalDays} hari
              </p>
              <p className="text-xs text-slate-500">{formatID(selected.startDate)} – {formatID(selected.endDate)}</p>
              {selected.isPackage && (
                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                  {selected.parts.map((p) => (
                    <p key={p.id} className="text-xs text-slate-600">
                      · <span className="font-medium">{p.leaveType.name}</span>: {formatID(p.startDate)} – {formatID(p.endDate)} ({p.totalDays} hari)
                    </p>
                  ))}
                  <p className="text-[11px] text-slate-500">Keputusan berlaku untuk seluruh bagian paket sekaligus.</p>
                </div>
              )}
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
              <Link href={`/pengajuan/${selected.primaryId}`} className="text-xs font-semibold text-cyan-700 hover:underline">
                Lihat detail lengkap ›
              </Link>
              <Button variant="ghost" onClick={() => setSelected(null)}>Batal</Button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
