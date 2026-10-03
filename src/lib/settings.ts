import db from "./db";

let cache: { at: number; map: Map<string, string> } | null = null;
const TTL_MS = 60_000;

/** Ambil system setting (string) dengan cache 60 detik. */
export async function getSetting(key: string, fallback = ""): Promise<string> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    const rows = await db.systemSetting.findMany();
    cache = { at: now, map: new Map(rows.map((r) => [r.key, r.value])) };
  }
  return cache.map.get(key) ?? fallback;
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key, "");
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : fallback;
}

export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key, "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Paksa refresh cache (dipakai setelah admin mengubah setting). */
export function invalidateSettingsCache(): void {
  cache = null;
}

/** Simpan satu setting lalu refresh cache. */
export async function setSetting(key: string, value: string, description?: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value, description: description ?? null },
    update: { value },
  });
  cache = null;
}
