import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { verifyPassword, createSession, getSessionUser } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";

const loginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const user = await db.user.findUnique({
      where: { username: body.username },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive || !(await verifyPassword(body.password, user.passwordHash))) {
      await auditLog({ action: "LOGIN_FAILED", entityType: "User", newValue: { username: body.username }, ...getRequestMeta(req) });
      throw new ApiError("INVALID_CREDENTIALS", "Username atau password salah.", 401);
    }
    const meta = getRequestMeta(req);
    await createSession(user.id, meta);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await auditLog({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ...meta });
    const me = await getSessionUser();
    return ok({ user: me });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid", 422);
    return toErrorResponse(e);
  }
}
