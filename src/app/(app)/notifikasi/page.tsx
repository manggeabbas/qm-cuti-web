"use client";

import { useEffect, useState } from "react";
import { Button, Card, Badge, Spinner, EmptyState, PageHeader, ErrorBox, Select } from "@/components/ui";

interface Notif {
  id: number;
  eventType: string;
  channel: string;
  title: string;
  message: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  employee: { name: string; nik: string } | null;
}

export default function NotifikasiPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/notifications${status ? `?status=${status}` : ""}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setItems(j.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function processNow() {
    setProcessing(true);
    try {
      const r = await fetch("/api/notifications/process", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Log Notifikasi"
        subtitle="Riwayat pengiriman Telegram / WeCom"
        action={<Button variant="secondary" onClick={processNow} disabled={processing}>{processing ? "..." : "⟳ Proses Manual"}</Button>}
      />
      <div className="mb-4 w-48">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="PENDING">Pending</option>
          <option value="SENT">Terkirim</option>
          <option value="FAILED">Gagal</option>
        </Select>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada notifikasi" />
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-500">
                    {n.eventType} · {n.channel} · {n.employee ? `${n.employee.name} (${n.employee.nik})` : "-"} · percobaan {n.attempts}x
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.message.slice(0, 300)}{n.message.length > 300 ? "…" : ""}</p>
                  {n.errorMessage && <p className="mt-1 text-xs text-red-600">⚠ {n.errorMessage}</p>}
                </div>
                <Badge status={n.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
