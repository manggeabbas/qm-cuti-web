import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import db from "./db";
import { ApiError } from "./api";
import type { RoleName } from "@prisma/client";

export const SESSION_COOKIE = "qm_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: number;
  username: string;
  roles: RoleName[];
  employeeId: number | null;
  employee: {
    id: number;
    nik: string;
    name: string;
    positionId: number;
    positionCode: string;
    teamId: number;
    teamCode: string;
    sectionId: number;
    departmentId: number;
    divisionId: number;
    supervisorId: number | null;
  } | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Cookie Secure hanya bila aplikasi diakses via HTTPS (atau dipaksa via COOKIE_SECURE).
 * Jangan pakai flag Secure di atas HTTP biasa — browser akan menolak cookie sesi. */
function isCookieSecure(): boolean {
  if (process.env.COOKIE_SECURE !== undefined) return process.env.COOKIE_SECURE === "true";
  return (process.env.APP_URL ?? "").startsWith("https://");
}
/** Buat sesi baru + set cookie httpOnly. Kembalikan token mentah (untuk testing). */
export async function createSession(userId: number, meta?: { ipAddress?: string; userAgent?: string }): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.userSession.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.userSession.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

async function loadUser(userId: number): Promise<SessionUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      employee: { include: { position: true, team: true } },
    },
  });
  if (!u || !u.isActive) return null;
  return {
    id: u.id,
    username: u.username,
    roles: u.roles.map((r) => r.role.name),
    employeeId: u.employeeId,
    employee: u.employee
      ? {
          id: u.employee.id,
          nik: u.employee.nik,
          name: u.employee.name,
          positionId: u.employee.positionId,
          positionCode: u.employee.position.code,
          teamId: u.employee.teamId,
          teamCode: u.employee.team.code,
          sectionId: u.employee.sectionId,
          departmentId: u.employee.departmentId,
          divisionId: u.employee.divisionId,
          supervisorId: u.employee.supervisorId,
        }
      : null,
  };
}

/** Ambil user dari cookie sesi. null jika tidak login / sesi kedaluwarsa. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sess = await db.userSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!sess || sess.expiresAt < new Date()) {
    if (sess) await db.userSession.delete({ where: { id: sess.id } }).catch(() => {});
    return null;
  }
  return loadUser(sess.userId);
}

/** Wajib login — lempar 401 jika tidak ada sesi. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ApiError("UNAUTHORIZED", "Silakan login terlebih dahulu.", 401);
  return u;
}
