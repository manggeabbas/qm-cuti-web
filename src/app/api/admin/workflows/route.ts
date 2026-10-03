import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { z } from "zod";
import { WorkflowStepRole } from "@prisma/client";

const stepSchema = z.object({
  role: z.nativeEnum(WorkflowStepRole),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama workflow wajib diisi.").max(120),
  teamId: z.number().int().nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1, "Minimal 1 tahap.").max(6, "Maksimal 6 tahap."),
});

/** GET /api/admin/workflows — daftar workflow + steps (ADMIN) */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const rows = await db.approvalWorkflow.findMany({
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        team: { select: { id: true, code: true, name: true } },
        _count: { select: { requests: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return ok(rows);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** POST /api/admin/workflows — buat workflow baru (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createSchema.parse(await req.json());

    if (body.teamId) {
      const team = await db.team.findUnique({ where: { id: body.teamId } });
      if (!team) return fail("INVALID_INPUT", "Regu tidak ditemukan.", 404);
      const dup = await db.approvalWorkflow.findFirst({
        where: { teamId: body.teamId, isActive: true },
      });
      if (dup) return fail("DUPLICATE", "Regu ini sudah memiliki workflow aktif.", 409);
    }

    const created = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.approvalWorkflow.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.approvalWorkflow.create({
        data: {
          name: body.name,
          teamId: body.teamId ?? null,
          isDefault: body.isDefault ?? false,
          isActive: body.isActive ?? true,
          steps: {
            create: body.steps.map((s, i) => ({ stepOrder: i + 1, role: s.role })),
          },
        },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_WORKFLOW",
      entityType: "ApprovalWorkflow",
      entityId: created.id,
      newValue: { name: created.name },
      ...getRequestMeta(req),
    });
    return ok(created, 201);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}
