import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate, toISODate } from "@/lib/dates";
import { computeLeaveDays, loadValidationSettings } from "@/lib/leave/validation";
import { canViewRequest } from "@/lib/leave/workflow";
import type { Prisma } from "@prisma/client";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  }
  return id;
}

const detailInclude = {
  employee: {
    include: {
      position: { select: { id: true, code: true, name: true } },
      team: { select: { id: true, code: true, name: true } },
      section: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
    },
  },
  leaveType: true,
  approvals: {
    orderBy: { createdAt: "asc" } as const,
    include: { approver: { select: { id: true, username: true } } },
  },
  attachments: { orderBy: { uploadedAt: "asc" } as const },
  conflicts: { orderBy: { detectedAt: "desc" } as const },
} satisfies Prisma.LeaveRequestInclude;

// ---------------- GET: detail ----------------

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = parseId(id);

    const item = await db.leaveRequest.findUnique({
      where: { id: requestId },
      include: detailInclude,
    });
    if (!item) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (!canViewRequest(user, item)) {
      throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses ke pengajuan ini.", 403);
    }
    // Bagian lain dalam paket yang sama (bila ada)
    let packageParts: Array<{
      id: number;
      packageOrder: number | null;
      status: string;
      startDate: unknown;
      endDate: unknown;
      totalDays: unknown;
      leaveType: { id: number; code: string; name: string };
    }> | null = null;
    if (item.packageId) {
      const parts = await db.leaveRequest.findMany({
        where: { packageId: item.packageId },
        select: {
          id: true,
          packageOrder: true,
          status: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          leaveType: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ packageOrder: "asc" }, { id: "asc" }],
      });
      if (parts.length > 1) packageParts = parts;
    }
    return ok({ ...item, packageParts });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// ---------------- PUT: ubah DRAFT (pemilik saja) ----------------

const updateSchema = z.object({
  leaveTypeId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai harus YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai harus YYYY-MM-DD").optional(),
  reason: z.string().min(3, "Alasan wajib diisi (min. 3 karakter)").max(2000).optional(),
  addressDuringLeave: z.string().max(500).nullable().optional(),
  contactNumber: z.string().max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  packageId: z.string().max(100).nullable().optional(),
  packageOrder: z.number().int().min(1).max(2).nullable().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = parseId(id);

    const item = await db.leaveRequest.findUnique({ where: { id: requestId } });
    if (!item) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (user.employeeId == null || user.employeeId !== item.employeeId) {
      throw new ApiError("FORBIDDEN", "Hanya pemilik pengajuan yang dapat mengubahnya.", 403);
    }
    if (item.status !== "DRAFT") {
      throw new ApiError(
        "INVALID_STATUS",
        "Hanya pengajuan berstatus Draft yang dapat diubah.",
        400,
      );
    }

    const body = updateSchema.parse(await req.json());

    const data: Prisma.LeaveRequestUpdateInput = {};
    if (body.leaveTypeId !== undefined) {
      const lt = await db.leaveType.findUnique({ where: { id: body.leaveTypeId } });
      if (!lt || !lt.isActive) {
        throw new ApiError("NOT_FOUND", "Jenis cuti tidak ditemukan atau tidak aktif.", 404);
      }
      data.leaveType = { connect: { id: body.leaveTypeId } };
    }
    let start = item.startDate;
    let end = item.endDate;
    if (body.startDate !== undefined || body.endDate !== undefined) {
      try {
        start = body.startDate !== undefined ? parseISODate(body.startDate) : item.startDate;
        end = body.endDate !== undefined ? parseISODate(body.endDate) : item.endDate;
      } catch {
        throw new ApiError("INVALID_DATE", "Tanggal tidak valid (gunakan format YYYY-MM-DD).", 422);
      }
      if (start > end) {
        throw new ApiError("INVALID_RANGE", "Tanggal mulai tidak boleh setelah tanggal selesai.", 422);
      }
      data.startDate = start;
      data.endDate = end;
    }
    if (body.reason !== undefined) data.reason = body.reason.trim();
    if (body.addressDuringLeave !== undefined)
      data.addressDuringLeave = body.addressDuringLeave?.trim() || null;
    if (body.contactNumber !== undefined) data.contactNumber = body.contactNumber?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.packageId !== undefined) data.packageId = body.packageId || null;
    if (body.packageOrder !== undefined) data.packageOrder = body.packageOrder;

    // hitung ulang totalDays bila tanggal berubah
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const settings = await loadValidationSettings();
      const hds = await db.holiday.findMany({ where: { date: { gte: start, lte: end } } });
      const holidays = new Map(hds.map((h) => [toISODate(h.date), h.countsAsLeaveDay]));
      data.totalDays = computeLeaveDays(start, end, holidays, settings.COUNT_WEEKEND_AS_LEAVE);
    }

    const updated = await db.leaveRequest.update({
      where: { id: requestId },
      data,
      include: detailInclude,
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_LEAVE_REQUEST",
      entityType: "LeaveRequest",
      entityId: requestId,
      newValue: body,
      ...getRequestMeta(req),
    });

    return ok({ request: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}

// ---------------- DELETE: hapus DRAFT (pemilik / admin) ----------------

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = parseId(id);

    const item = await db.leaveRequest.findUnique({ where: { id: requestId } });
    if (!item) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    const isOwner = user.employeeId != null && user.employeeId === item.employeeId;
    if (!isOwner && !hasRole(user, "ADMIN")) {
      throw new ApiError("FORBIDDEN", "Hanya pemilik pengajuan atau admin yang dapat menghapusnya.", 403);
    }
    if (item.status !== "DRAFT") {
      throw new ApiError(
        "INVALID_STATUS",
        "Hanya pengajuan berstatus Draft yang dapat dihapus.",
        400,
      );
    }

    // hapus file lampiran dari storage (best-effort)
    const dir = path.join(process.cwd(), "storage", "attachments", String(requestId));
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await db.leaveRequest.delete({ where: { id: requestId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_LEAVE_REQUEST",
      entityType: "LeaveRequest",
      entityId: requestId,
      oldValue: { employeeId: item.employeeId, leaveTypeId: item.leaveTypeId },
      ...getRequestMeta(req),
    });

    return ok({ deleted: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
