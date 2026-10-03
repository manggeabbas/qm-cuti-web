import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const itemSchema = z.object({
  periodOrder: z.number().int().min(1),
  teamId: z.number().int(),
  shiftTypeId: z.number().int(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).min(1).optional(),
});

/** GET /api/shifts/templates/[id] */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.shiftRotationTemplate.findUnique({
      where: { id: Number(id) },
      include: {
        items: {
          include: {
            team: { select: { id: true, code: true, name: true } },
            shiftType: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ periodOrder: "asc" }, { teamId: "asc" }],
        },
        _count: { select: { periods: true } },
      },
    });
    if (!row) return fail("NOT_FOUND", "Template tidak ditemukan.", 404);
    return ok(row);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * PUT /api/shifts/templates/[id] — ubah template.
 * Bila template sudah pernah dipakai periode, version naik (PRD §20A.3);
 * jadwal historis tidak berubah karena roster menyimpan shiftTypeId langsung.
 */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const { id } = await ctx.params;
    const tplId = Number(id);
    const existing = await db.shiftRotationTemplate.findUnique({
      where: { id: tplId },
      include: { _count: { select: { periods: true } } },
    });
    if (!existing) return fail("NOT_FOUND", "Template tidak ditemukan.", 404);
    const body = updateSchema.parse(await req.json());

    const bumpVersion = existing._count.periods > 0;

    const updated = await db.$transaction(async (tx) => {
      if (body.items) {
        await tx.shiftRotationTemplateItem.deleteMany({ where: { templateId: tplId } });
        await tx.shiftRotationTemplateItem.createMany({
          data: body.items.map((i) => ({ templateId: tplId, ...i })),
        });
      }
      return tx.shiftRotationTemplate.update({
        where: { id: tplId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(bumpVersion ? { version: { increment: 1 } } : {}),
        },
        include: { items: true },
      });
    });

    await auditLog({
      userId: user.id, action: "UPDATE_SHIFT_TEMPLATE", entityType: "ShiftRotationTemplate",
      entityId: tplId,
      oldValue: { version: existing.version },
      newValue: { version: updated.version, versionBumped: bumpVersion },
      ...getRequestMeta(req),
    });
    return ok({ ...updated, versionBumped: bumpVersion });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}

/** DELETE /api/shifts/templates/[id] — hanya bila belum pernah dipakai */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const { id } = await ctx.params;
    const tplId = Number(id);
    const existing = await db.shiftRotationTemplate.findUnique({
      where: { id: tplId },
      include: { _count: { select: { periods: true } } },
    });
    if (!existing) return fail("NOT_FOUND", "Template tidak ditemukan.", 404);
    if (existing._count.periods > 0) {
      return fail("IN_USE", "Template sudah dipakai periode; nonaktifkan saja.", 400);
    }
    await db.shiftRotationTemplate.delete({ where: { id: tplId } });
    await auditLog({
      userId: user.id, action: "DELETE_SHIFT_TEMPLATE", entityType: "ShiftRotationTemplate",
      entityId: tplId, ...getRequestMeta(req),
    });
    return ok({ deleted: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
