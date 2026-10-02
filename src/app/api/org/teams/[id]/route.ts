import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapTeam, createTeamSchema } from "../route";

const updateTeamSchema = createTeamSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

const includeChain = {
  section: {
    select: {
      id: true,
      code: true,
      name: true,
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          division: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} as const;

/** GET /api/org/teams/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.team.findUnique({
      where: { id: Number(id) },
      include: includeChain,
    });
    if (!row) return fail("NOT_FOUND", "Regu tidak ditemukan.", 404);
    return ok(mapTeam(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/org/teams/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const teamId = Number(id);
    const body = updateTeamSchema.parse(await req.json());

    const existing = await db.team.findUnique({ where: { id: teamId }, include: includeChain });
    if (!existing) return fail("NOT_FOUND", "Regu tidak ditemukan.", 404);

    if (body.parentId !== undefined) {
      const parent = await db.section.findUnique({ where: { id: body.parentId } });
      if (!parent) return fail("INVALID_INPUT", "Seksi induk tidak ditemukan.", 400);
    }

    const updated = await db.team.update({
      where: { id: teamId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { sectionId: body.parentId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: includeChain,
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_TEAM",
      entityType: "Team",
      entityId: teamId,
      oldValue: mapTeam(existing),
      newValue: mapTeam(updated),
      ...getRequestMeta(req),
    });
    return ok(mapTeam(updated));
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

/** DELETE /api/org/teams/[id] (ADMIN) — tolak jika masih digunakan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const teamId = Number(id);

    const existing = await db.team.findUnique({ where: { id: teamId }, include: includeChain });
    if (!existing) return fail("NOT_FOUND", "Regu tidak ditemukan.", 404);

    const [empCount, rosterCount, workflowCount] = await Promise.all([
      db.employee.count({ where: { teamId } }),
      db.shiftRoster.count({ where: { teamId } }),
      db.approvalWorkflow.count({ where: { teamId } }),
    ]);
    if (empCount > 0 || rosterCount > 0 || workflowCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.team.delete({ where: { id: teamId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_TEAM",
      entityType: "Team",
      entityId: teamId,
      oldValue: mapTeam(existing),
      ...getRequestMeta(req),
    });
    return ok({ message: "Regu dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
