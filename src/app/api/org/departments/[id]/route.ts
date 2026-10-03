import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapDepartment, createDepartmentSchema } from "../route";

const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

const includeParent = { company: { select: { id: true, code: true, name: true } } } as const;

/** GET /api/org/departments/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.department.findUnique({
      where: { id: Number(id) },
      include: includeParent,
    });
    if (!row) return fail("NOT_FOUND", "Departemen tidak ditemukan.", 404);
    return ok(mapDepartment(row, row.company));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/org/departments/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const deptId = Number(id);
    const body = updateDepartmentSchema.parse(await req.json());

    const existing = await db.department.findUnique({ where: { id: deptId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Departemen tidak ditemukan.", 404);

    if (body.parentId !== undefined) {
      const parent = await db.company.findUnique({ where: { id: body.parentId } });
      if (!parent) return fail("INVALID_INPUT", "Perusahaan induk tidak ditemukan.", 400);
    }

    const updated = await db.department.update({
      where: { id: deptId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { companyId: body.parentId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: includeParent,
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_DEPARTMENT",
      entityType: "Department",
      entityId: deptId,
      oldValue: mapDepartment(existing, existing.company),
      newValue: mapDepartment(updated, updated.company),
      ...getRequestMeta(req),
    });
    return ok(mapDepartment(updated, updated.company));
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

/** DELETE /api/org/departments/[id] (ADMIN) — tolak jika masih digunakan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const deptId = Number(id);

    const existing = await db.department.findUnique({ where: { id: deptId }, include: includeParent });
    if (!existing) return fail("NOT_FOUND", "Departemen tidak ditemukan.", 404);

    const [divisionCount, empCount] = await Promise.all([
      db.division.count({ where: { departmentId: deptId } }),
      db.employee.count({ where: { departmentId: deptId } }),
    ]);
    if (divisionCount > 0 || empCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.department.delete({ where: { id: deptId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_DEPARTMENT",
      entityType: "Department",
      entityId: deptId,
      oldValue: mapDepartment(existing, existing.company),
      ...getRequestMeta(req),
    });
    return ok({ message: "Departemen dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
