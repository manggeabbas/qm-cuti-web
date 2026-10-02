/** Util role murni — TANPA dependensi server, aman dipakai di client component. */
import type { RoleName } from "@prisma/client";

export const ROLE_HIERARCHY: RoleName[] = ["EMPLOYEE", "KOORDINATOR", "WAFOR", "FOREMAN", "SPV", "ADMIN"];

export function highestRole(roles: RoleName[]): RoleName {
  let best: RoleName = "EMPLOYEE";
  let bestIdx = -1;
  for (const r of roles) {
    const i = ROLE_HIERARCHY.indexOf(r);
    if (i > bestIdx) {
      bestIdx = i;
      best = r;
    }
  }
  return best;
}

export function hasRole(user: { roles: RoleName[] }, ...roles: RoleName[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}
