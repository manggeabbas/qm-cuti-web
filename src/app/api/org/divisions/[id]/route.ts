import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapDivision, createDivisionSchema } from "../route";

const updateDivisionSchema = createDivisionSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

const includeParent = { department: { select: { id: true, code: true, name: true } } } as const;

/** GET /api/org/divisions/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.division.findUnique({
      where: { id: Number(id) },
      include: includeParent,
    });
    if (!row) return fail("NOT_FOUND", "Divisi tidak ditemukan.", 404);
    return ok(mapDivision(row, row.department));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/org/divisions/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const divId = Number(id);
    const body = updateDivisionSchema.parse(await req.json());

    const existing = await db.division.findUnique({ where: { id: divId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Divisi tidak ditemukan.", 404);

    if (body.parentId !== undefined) {
      const parent = await db.department.findUnique({ where: { id: body.parentId } });
      if (!parent) return fail("INVALID_INPUT", "Departemen induk tidak ditemukan.", 400);
    }

    const updated = await db.division.update({
      where: { id: divId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { departmentId: body.parentId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: includeParent,
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_DIVISION",
      entityType: "Division",
      entityId: divId,
      oldValue: mapDivision(existing, existing.department),
      newValue: mapDivision(updated, updated.department),
      ...getRequestMeta(req),
    });
    return ok(mapDivision(updated, updated.department));
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

/** DELETE /api/org/divisions/[id] (ADMIN) — tolak jika masih digunakan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const divId = Number(id);

    const existing = await db.division.findUnique({ where: { id: divId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Divisi tidak ditemukan.", 404);

    const [sectionCount, empCount] = await Promise.all([
      db.section.count({ where: { divisionId: divId } }),
      db.employee.count({ where: { divisionId: divId } }),
    ]);
    if (sectionCount > 0 || empCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.division.delete({ where: { id: divId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_DIVISION",
      entityType: "Division",
      entityId: divId,
      oldValue: mapDivision(existing, existing.department),
      ...getRequestMeta(req),
    });
    return ok({ message: "Divisi dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
