"use client";

import React from "react";
import { Card, EmptyState } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  /** Sembunyikan kolom di tampilan kartu mobile (tetap tampil di tabel desktop). */
  hideOnMobile?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => React.Key;
  actions?: (row: T) => React.ReactNode;
  actionsHeader?: string;
  emptyTitle?: string;
  emptyHint?: string;
  emptyIcon?: string;
  onRowClick?: (row: T) => void;
}

/**
 * Tabel responsif gaya korporat:
 * - desktop (>= sm): tabel padat dengan header tebal dan baris zebra-style.
 * - mobile (< sm): daftar kartu berisi pasangan label–nilai, tanpa scroll horizontal.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  actions,
  actionsHeader = "Aksi",
  emptyTitle = "Belum ada data",
  emptyHint,
  emptyIcon,
  onRowClick,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} icon={emptyIcon} />;
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>
                    {c.header}
                  </th>
                ))}
                {actions && (
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {actionsHeader}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                    i % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  } ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle text-slate-700 ${c.className ?? ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <Card key={rowKey(row)} className="space-y-2">
            {columns
              .filter((c) => !c.hideOnMobile)
              .map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {c.header}
                  </span>
                  <span className="min-w-0 text-right text-slate-800">{c.render(row)}</span>
                </div>
              ))}
            {actions && (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">{actions(row)}</div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
