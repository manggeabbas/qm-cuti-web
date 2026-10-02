import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapPosition, updatePositionSchema } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/positions/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.position.findUnique({ where: { id: Number(id) } });
    if (!row) return fail("NOT_FOUND", "Jabatan tidak ditemukan.", 404);
    return ok(mapPosition(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/positions/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const posId = Number(id);
    const body = updatePositionSchema.parse(await req.json());

    const existing = await db.position.findUnique({ where: { id: posId } });
    if (!existing) return fail("NOT_FOUND", "Jabatan tidak ditemukan.", 404);

    const updated = await db.position.update({
      where: { id: posId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.levelOrder !== undefined ? { levelOrder: body.levelOrder } : {}),
        ...(body.isOperationalGroup !== undefined ? { isOperationalGroup: body.isOperationalGroup } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_POSITION",
      entityType: "Position",
      entityId: posId,
      oldValue: mapPosition(existing),
      newValue: mapPosition(updated),
      ...getRequestMeta(req),
    });
    return ok(mapPosition(updated));
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("DUPLICATE", "Kode sudah digunakan.", 409);
    }
    return toErrorResponse(e);
  }
}

/** DELETE /api/positions/[id] (ADMIN) — tolak jika masih dipakai karyawan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const posId = Number(id);

    const existing = await db.position.findUnique({ where: { id: posId } });
    if (!existing) return fail("NOT_FOUND", "Jabatan tidak ditemukan.", 404);

    const empCount = await db.employee.count({ where: { positionId: posId } });
    if (empCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.position.delete({ where: { id: posId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_POSITION",
      entityType: "Position",
      entityId: posId,
      oldValue: mapPosition(existing),
      ...getRequestMeta(req),
    });
    return ok({ message: "Jabatan dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
