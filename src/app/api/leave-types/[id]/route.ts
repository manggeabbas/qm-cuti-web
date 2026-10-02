import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { mapLeaveType, updateLeaveTypeSchema } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leave-types/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.leaveType.findUnique({ where: { id: Number(id) } });
    if (!row) return fail("NOT_FOUND", "Jenis cuti tidak ditemukan.", 404);
    return ok(mapLeaveType(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/leave-types/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const ltId = Number(id);
    const body = updateLeaveTypeSchema.parse(await req.json());

    const existing = await db.leaveType.findUnique({ where: { id: ltId } });
    if (!existing) return fail("NOT_FOUND", "Jenis cuti tidak ditemukan.", 404);

    const updated = await db.leaveType.update({
      where: { id: ltId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.defaultDays !== undefined ? { defaultDays: body.defaultDays } : {}),
        ...(body.eligibilityMonths !== undefined ? { eligibilityMonths: body.eligibilityMonths } : {}),
        ...(body.maxSingleDays !== undefined ? { maxSingleDays: body.maxSingleDays } : {}),
        ...(body.maxCombinedWithCfv !== undefined ? { maxCombinedWithCfv: body.maxCombinedWithCfv } : {}),
        ...(body.requiresAttachment !== undefined ? { requiresAttachment: body.requiresAttachment } : {}),
        ...(body.consumesBalance !== undefined ? { consumesBalance: body.consumesBalance } : {}),
        ...(body.countsAsLeaveDay !== undefined ? { countsAsLeaveDay: body.countsAsLeaveDay } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_LEAVE_TYPE",
      entityType: "LeaveType",
      entityId: ltId,
      oldValue: mapLeaveType(existing),
      newValue: mapLeaveType(updated),
      ...getRequestMeta(req),
    });
    return ok(mapLeaveType(updated));
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

/** DELETE /api/leave-types/[id] (ADMIN) — tolak jika sudah dipakai pengajuan */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const ltId = Number(id);

    const existing = await db.leaveType.findUnique({ where: { id: ltId } });
    if (!existing) return fail("NOT_FOUND", "Jenis cuti tidak ditemukan.", 404);

    const reqCount = await db.leaveRequest.count({ where: { leaveTypeId: ltId } });
    if (reqCount > 0) {
      return fail("IN_USE", "Tidak dapat dihapus karena masih digunakan.", 409);
    }

    await db.leaveType.delete({ where: { id: ltId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_LEAVE_TYPE",
      entityType: "LeaveType",
      entityId: ltId,
      oldValue: mapLeaveType(existing),
      ...getRequestMeta(req),
    });
    return ok({ message: "Jenis cuti dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
