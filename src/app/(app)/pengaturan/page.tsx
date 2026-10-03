"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Field, PageHeader, Spinner, EmptyState, ErrorBox } from "@/components/ui";
import { api } from "@/lib/client-api";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

export default function PengaturanPage() {
  const [items, setItems] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const d = await api<Setting[]>("/api/admin/settings");
        setItems(d);
        setDrafts(Object.fromEntries(d.map((s) => [s.key, s.value])));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(key: string) {
    setSavingKey(key);
    setNotice("");
    setError("");
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: drafts[key] ?? "" }),
      });
      setItems((list) => list.map((s) => (s.key === key ? { ...s, value: drafts[key] ?? "" } : s)));
      setNotice(`Pengaturan ${key} tersimpan.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Parameter aturan cuti aplikasi (system settings)" />

      <ErrorBox message={error} />
      {notice && (
        <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm text-cyan-700">
          {notice}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada pengaturan" />
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.key}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label={s.key}>
                    <Input
                      value={drafts[s.key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                      className="font-mono"
                    />
                  </Field>
                  {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
                </div>
                <Button
                  onClick={() => save(s.key)}
                  disabled={savingKey === s.key || drafts[s.key] === s.value}
                  className="shrink-0"
                >
                  {savingKey === s.key ? "Menyimpan…" : "Simpan"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
