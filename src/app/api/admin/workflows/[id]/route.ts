import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { z } from "zod";
import { WorkflowStepRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const stepSchema = z.object({ role: z.nativeEnum(WorkflowStepRole) });

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  teamId: z.number().int().nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(6).optional(),
});

/** GET /api/admin/workflows/[id] */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const row = await db.approvalWorkflow.findUnique({
      where: { id: Number(id) },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        team: { select: { id: true, code: true, name: true } },
        _count: { select: { requests: true } },
      },
    });
    if (!row) return fail("NOT_FOUND", "Workflow tidak ditemukan.", 404);
    return ok(row);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/admin/workflows/[id] — ubah workflow + steps (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const wfId = Number(id);
    const existing = await db.approvalWorkflow.findUnique({ where: { id: wfId } });
    if (!existing) return fail("NOT_FOUND", "Workflow tidak ditemukan.", 404);
    const body = updateSchema.parse(await req.json());

    if (body.teamId !== undefined && body.teamId !== null) {
      const team = await db.team.findUnique({ where: { id: body.teamId } });
      if (!team) return fail("INVALID_INPUT", "Regu tidak ditemukan.", 404);
      const dup = await db.approvalWorkflow.findFirst({
        where: { teamId: body.teamId, isActive: true, id: { not: wfId } },
      });
      if (dup) return fail("DUPLICATE", "Regu ini sudah memiliki workflow aktif lain.", 409);
    }

    const updated = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.approvalWorkflow.updateMany({
          where: { isDefault: true, id: { not: wfId } },
          data: { isDefault: false },
        });
      }
      if (body.steps) {
        await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: wfId } });
        await tx.approvalWorkflowStep.createMany({
          data: body.steps.map((s, i) => ({ workflowId: wfId, stepOrder: i + 1, role: s.role })),
        });
      }
      return tx.approvalWorkflow.update({
        where: { id: wfId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_WORKFLOW",
      entityType: "ApprovalWorkflow",
      entityId: wfId,
      newValue: { name: updated.name },
      ...getRequestMeta(req),
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}

/** DELETE /api/admin/workflows/[id] — hapus bila tidak dipakai pengajuan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const wfId = Number(id);
    const existing = await db.approvalWorkflow.findUnique({
      where: { id: wfId },
      include: { _count: { select: { requests: true } } },
    });
    if (!existing) return fail("NOT_FOUND", "Workflow tidak ditemukan.", 404);
    if (existing.isDefault) return fail("INVALID", "Workflow default tidak dapat dihapus.", 400);
    if (existing._count.requests > 0) {
      return fail("IN_USE", "Workflow sudah dipakai pengajuan; nonaktifkan saja.", 400);
    }
    await db.approvalWorkflow.delete({ where: { id: wfId } });
    await auditLog({
      userId: user.id,
      action: "DELETE_WORKFLOW",
      entityType: "ApprovalWorkflow",
      entityId: wfId,
      ...getRequestMeta(req),
    });
    return ok({ deleted: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
