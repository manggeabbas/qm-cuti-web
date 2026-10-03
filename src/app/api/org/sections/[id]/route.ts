import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapSection, createSectionSchema } from "../route";

const updateSectionSchema = createSectionSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

const includeParent = { division: { select: { id: true, code: true, name: true } } } as const;

/** GET /api/org/sections/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.section.findUnique({
      where: { id: Number(id) },
      include: includeParent,
    });
    if (!row) return fail("NOT_FOUND", "Seksi tidak ditemukan.", 404);
    return ok(mapSection(row, row.division));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/org/sections/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const sectionId = Number(id);
    const body = updateSectionSchema.parse(await req.json());

    const existing = await db.section.findUnique({ where: { id: sectionId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Seksi tidak ditemukan.", 404);

    if (body.parentId !== undefined) {
      const parent = await db.division.findUnique({ where: { id: body.parentId } });
      if (!parent) return fail("INVALID_INPUT", "Divisi induk tidak ditemukan.", 400);
    }

    const updated = await db.section.update({
      where: { id: sectionId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { divisionId: body.parentId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: includeParent,
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_SECTION",
      entityType: "Section",
      entityId: sectionId,
      oldValue: mapSection(existing, existing.division),
      newValue: mapSection(updated, updated.division),
      ...getRequestMeta(req),
    });
    return ok(mapSection(updated, updated.division));
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

/** DELETE /api/org/sections/[id] (ADMIN) — tolak jika masih digunakan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const sectionId = Number(id);

    const existing = await db.section.findUnique({ where: { id: sectionId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Seksi tidak ditemukan.", 404);

    const [teamCount, empCount] = await Promise.all([
      db.team.count({ where: { sectionId } }),
      db.employee.count({ where: { sectionId } }),
    ]);
    if (teamCount > 0 || empCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.section.delete({ where: { id: sectionId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_SECTION",
      entityType: "Section",
      entityId: sectionId,
      oldValue: mapSection(existing, existing.division),
      ...getRequestMeta(req),
    });
    return ok({ message: "Seksi dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
