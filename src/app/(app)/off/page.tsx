"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { formatID } from "@/lib/dates-client";

interface OffMe {
  offDayOfWeek: number | null;
  teamCounts: number[];
}

const DOW_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// Urutan pilihan: Kamis–Selasa (Rabu OFF bersama, tidak disertakan).
const CHOICES = [
  { dow: 4, label: "Kamis" },
  { dow: 5, label: "Jumat" },
  { dow: 6, label: "Sabtu" },
  { dow: 0, label: "Minggu" },
  { dow: 1, label: "Senin" },
  { dow: 2, label: "Selasa" },
];

export default function OffSayaPage() {
  const [data, setData] = useState<OffMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/off/me").then((res) => res.json());
      if (!r.ok) throw new Error(r.error.message);
      setData(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat hari OFF.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setDay(dow: number | null) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await fetch("/api/off/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offDayOfWeek: dow }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setData((d) => (d ? { ...d, offDayOfWeek: j.data.offDayOfWeek } : d));
      const warns = (j.data.warnings ?? []).join(" ");
      setSuccess(
        dow == null ? "Hari OFF dikosongkan." : `Hari OFF ditetapkan: ${DOW_FULL[dow]}. Berlaku setiap minggu. ${warns}`,
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  // Pratinjau tanggal OFF pada bulan ini berdasarkan hari yang dipilih.
  const offDow = data?.offDayOfWeek ?? null;
  const previewDates = useMemo(() => {
    if (offDow == null) return [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const out: string[] = [];
    for (let d = 1; d <= last; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (new Date(`${iso}T00:00:00Z`).getUTCDay() === offDow) out.push(iso);
    }
    return out;
  }, [offDow]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="OFF Saya"
        subtitle="Hari OFF bersifat ketetapan: pilih satu hari (Kamis–Selasa), berlaku setiap minggu."
      />
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      {success && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : !data ? (
        <ErrorBox message={error || "Tidak dapat memuat data."} />
      ) : (
        <>
          <Card
            title="Pilih Hari OFF"
            description="Rabu adalah OFF bersama, jadi tidak bisa dipilih. Hari yang dipilih berlaku tiap minggu sampai diubah."
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {CHOICES.map((c) => {
                const active = data.offDayOfWeek === c.dow;
                const count = data.teamCounts[c.dow] ?? 0;
                return (
                  <button
                    key={c.dow}
                    type="button"
                    disabled={busy}
                    onClick={() => setDay(c.dow)}
                    className={`rounded-lg border px-2 py-3 text-center transition disabled:opacity-60 ${
                      active
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className={`mt-0.5 block text-[10px] ${active ? "text-emerald-50" : "text-slate-400"}`}>
                      {count} org
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <p className="text-sm text-slate-600">
                Hari OFF saat ini:{" "}
                <span className="font-semibold text-slate-900">
                  {data.offDayOfWeek == null ? "Belum ditetapkan" : DOW_FULL[data.offDayOfWeek]}
                </span>
              </p>
              {data.offDayOfWeek != null && (
                <Button size="sm" variant="ghost" onClick={() => setDay(null)} disabled={busy}>
                  Kosongkan
                </Button>
              )}
            </div>
          </Card>

          <div className="mt-4">
            <Card title="Pratinjau bulan ini">
              {previewDates.length === 0 ? (
                <EmptyState title="Belum ada hari OFF" hint="Pilih salah satu hari di atas." icon="🌴" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {previewDates.map((iso) => (
                    <span
                      key={iso}
                      className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800"
                    >
                      {formatID(iso)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
