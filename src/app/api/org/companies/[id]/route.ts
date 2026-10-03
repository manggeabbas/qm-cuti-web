import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapCompany, createCompanySchema } from "../route";

const updateCompanySchema = createCompanySchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/org/companies/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.company.findUnique({ where: { id: Number(id) } });
    if (!row) return fail("NOT_FOUND", "Perusahaan tidak ditemukan.", 404);
    return ok(mapCompany(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/org/companies/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const companyId = Number(id);
    const body = updateCompanySchema.parse(await req.json());

    const existing = await db.company.findUnique({ where: { id: companyId } });
    if (!existing) return fail("NOT_FOUND", "Perusahaan tidak ditemukan.", 404);

    const updated = await db.company.update({
      where: { id: companyId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_COMPANY",
      entityType: "Company",
      entityId: companyId,
      oldValue: mapCompany(existing),
      newValue: mapCompany(updated),
      ...getRequestMeta(req),
    });
    return ok(mapCompany(updated));
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

/** DELETE /api/org/companies/[id] (ADMIN) — tolak jika masih digunakan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const companyId = Number(id);

    const existing = await db.company.findUnique({ where: { id: companyId } });
    if (!existing) return fail("NOT_FOUND", "Perusahaan tidak ditemukan.", 404);

    const deptCount = await db.department.count({ where: { companyId } });
    if (deptCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.company.delete({ where: { id: companyId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_COMPANY",
      entityType: "Company",
      entityId: companyId,
      oldValue: mapCompany(existing),
      ...getRequestMeta(req),
    });
    return ok({ message: "Perusahaan dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
