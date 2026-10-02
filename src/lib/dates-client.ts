/** Helper tanggal ringan untuk client component (tanpa dependensi server). */
export function formatID(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${dt.getUTCDate()} ${bulan[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

export function toISODateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
