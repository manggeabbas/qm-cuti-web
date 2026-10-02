"use client";

import { useState } from "react";
import { Button, Card, PageHeader, ErrorBox, Input, Field, Select, Spinner } from "@/components/ui";

const TYPES = [
  { value: "leave", label: "Laporan Cuti" },
  { value: "balance", label: "Laporan Saldo" },
  { value: "approval", label: "Laporan Approval" },
  { value: "conflict", label: "Laporan Konflik" },
];

export default function LaporanPage() {
  const [type, setType] = useState("leave");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function preview() {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ format: "json" });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (type === "balance") p.set("year", year);
      const r = await fetch(`/api/reports/${type}?${p}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error.message);
      setColumns(j.data.columns);
      setRows(j.data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoading(false);
    }
  }

  function download(format: string) {
    const p = new URLSearchParams({ format });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (type === "balance") p.set("year", year);
    window.open(`/api/reports/${type}?${p}`, "_blank");
  }

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Laporan cuti, saldo, approval & konflik" />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Jenis Laporan">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          {type === "balance" ? (
            <Field label="Tahun">
              <Input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
            </Field>
          ) : (
            <>
              <Field label="Dari"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Sampai"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </>
          )}
          <div className="flex items-end">
            <Button onClick={preview} disabled={loading} className="w-full">Tampilkan</Button>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => download("xlsx")}>⬇ Excel</Button>
            <Button variant="secondary" onClick={() => download("csv")}>⬇ CSV</Button>
            <Button variant="secondary" onClick={() => download("pdf")}>⬇ PDF</Button>
          </div>
        )}
      </Card>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : (
        rows.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left uppercase text-slate-500">
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-2 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className="whitespace-nowrap px-2 py-1.5">{String(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="mt-2 text-xs text-slate-500">Menampilkan 100 dari {rows.length} baris. Unduh Excel/CSV untuk lengkap.</p>}
          </Card>
        )
      )}
    </div>
  );
}
