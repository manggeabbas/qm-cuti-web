import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

const schema = z.object({
  employeeId: z.number().int(),
  telegramUserId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
});

/** POST /api/admin/telegram/link — hubungkan manual akun Telegram karyawan */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = schema.parse(await req.json());
    const row = await db.telegramUser.upsert({
      where: { employeeId: body.employeeId },
      create: { employeeId: body.employeeId, telegramUserId: body.telegramUserId, isActive: true },
      update: { telegramUserId: body.telegramUserId, isActive: true },
    });
    await auditLog({ userId: user.id, action: "LINK_TELEGRAM", entityType: "Employee", entityId: body.employeeId, ...getRequestMeta(req) });
    return ok({ linked: true, id: row.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid", 422);
    return toErrorResponse(e);
  }
}

/** GET /api/admin/telegram/link — daftar binding */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const rows = await db.telegramUser.findMany({
      include: { employee: { select: { nik: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok({
      bindings: rows.map((r) => ({
        id: r.id,
        employee: r.employee,
        telegramUserId: r.telegramUserId.toString(),
        username: r.username,
        isActive: r.isActive,
      })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
