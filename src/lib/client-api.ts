/** Helper fetch untuk client component — mengikuti kontrak { ok, data } / { ok, error }. */

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  } | null;
  if (!j || j.ok !== true) {
    throw new Error(j?.error?.message ?? `Permintaan gagal (HTTP ${r.status}).`);
  }
  return j.data as T;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
