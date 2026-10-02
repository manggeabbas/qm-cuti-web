import db from "./db";
import { ApiError } from "./api";
import type { SessionUser } from "./auth";
import type { RoleName } from "@prisma/client";

import { highestRole, hasRole } from "./role-utils";
export { highestRole, hasRole };

/** Wajib salah satu role — lempar 403 jika tidak memenuhi. */
export function requireRole(user: SessionUser, ...roles: RoleName[]): void {
  if (user.roles.includes("ADMIN")) return; // admin lolos semua
  if (!hasRole(user, ...roles)) {
    throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses untuk tindakan ini.", 403);
  }
}

// ---- Permission berbasis database (cache per role) ----

let permCache: { at: number; map: Map<string, Set<string>> } | null = null;
const PERM_TTL = 60_000;

async function loadPermMap(): Promise<Map<string, Set<string>>> {
  const now = Date.now();
  if (permCache && now - permCache.at < PERM_TTL) return permCache.map;
  const rows = await db.rolePermission.findMany({
    include: { role: true, permission: true },
  });
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = map.get(r.role.name) ?? new Set<string>();
    set.add(r.permission.code);
    map.set(r.role.name, set);
  }
  permCache = { at: now, map };
  return map;
}

export function invalidatePermissionCache(): void {
  permCache = null;
}

export async function hasPermission(user: SessionUser, code: string): Promise<boolean> {
  if (user.roles.includes("ADMIN")) return true;
  const map = await loadPermMap();
  return user.roles.some((r) => map.get(r)?.has(code));
}

export async function requirePermission(user: SessionUser, code: string): Promise<void> {
  if (!(await hasPermission(user, code))) {
    throw new ApiError("FORBIDDEN", "Anda tidak memiliki izin untuk tindakan ini.", 403);
  }
}
