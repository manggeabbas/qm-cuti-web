"use client";

import { Button } from "./ui";

export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-3">
      <p className="text-xs text-slate-500">
        Halaman {page} dari {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Sebelumnya
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Berikutnya ›
        </Button>
      </div>
    </div>
  );
}
