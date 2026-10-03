import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate, toISODate } from "@/lib/dates";
import { computeLeaveDays, loadValidationSettings } from "@/lib/leave/validation";
import { isKnownStatus } from "@/lib/leave/workflow";
import type { Prisma, RequestStatus } from "@prisma/client";

// ---------------- GET: daftar pengajuan ----------------

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);

    const where: Prisma.LeaveRequestWhereInput = {};

    const statusParam = sp.get("status");
    if (statusParam) {
      if (!isKnownStatus(statusParam)) {
        throw new ApiError("INVALID_FILTER", `Status tidak dikenal: ${statusParam}.`, 422);
      }
      where.status = statusParam as RequestStatus;
    }
    const leaveTypeId = sp.get("leaveTypeId");
    if (leaveTypeId) {
      const n = Number(leaveTypeId);
      if (!Number.isInteger(n)) throw new ApiError("INVALID_FILTER", "leaveTypeId tidak valid.", 422);
      where.leaveTypeId = n;
    }

    // teamId filter -> lewat relasi employee
    const teamId = sp.get("teamId");
    const employeeWhere: Prisma.EmployeeWhereInput = {};
    if (teamId) {
      const n = Number(teamId);
      if (!Number.isInteger(n)) throw new ApiError("INVALID_FILTER", "teamId tidak valid.", 422);
      employeeWhere.teamId = n;
    }
    const employeeIdParam = sp.get("employeeId");
    const filterEmployeeId = employeeIdParam ? Number(employeeIdParam) : null;
    if (employeeIdParam && !Number.isInteger(filterEmployeeId)) {
      throw new ApiError("INVALID_FILTER", "employeeId tidak valid.", 422);
    }

    const isAdmin = hasRole(user, "ADMIN");
    const isApprover =
      hasRole(user, "KOORDINATOR") ||
      hasRole(user, "WAFOR") ||
      hasRole(user, "FOREMAN") ||
      hasRole(user, "SPV") ||
      hasRole(user, "WSPV");

    if (!isAdmin) {
      if (!user.employee) {
        throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
      }
      if (isApprover) {
        // approver melihat area tanggung jawabnya (union bila multi-role)
        const orgConds: Prisma.EmployeeWhereInput[] = [];
        if (hasRole(user, "FOREMAN", "WAFOR")) orgConds.push({ teamId: user.employee.teamId });
        if (hasRole(user, "KOORDINATOR")) orgConds.push({ sectionId: user.employee.sectionId });
        if (hasRole(user, "SPV")) orgConds.push({ departmentId: user.employee.departmentId });
        if (hasRole(user, "WSPV")) orgConds.push({ divisionId: user.employee.divisionId });
        employeeWhere.OR = orgConds;
        if (filterEmployeeId != null) where.employeeId = filterEmployeeId;
      } else {
        // karyawan biasa: hanya milik sendiri
        where.employeeId = user.employee.id;
      }
    } else if (filterEmployeeId != null) {
      where.employeeId = filterEmployeeId;
    }

    if (Object.keys(employeeWhere).length > 0) where.employee = employeeWhere;

    const [total, items] = await Promise.all([
      db.leaveRequest.count({ where }),
      db.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              nik: true,
              team: { select: { id: true, name: true } },
            },
          },
          leaveType: { select: { id: true, code: true, name: true, category: true } },
        },
      }),
    ]);

    return ok(paged(items, total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

// ---------------- POST: buat DRAFT ----------------

const createSchema = z.object({
  leaveTypeId: z.number().int().positive("Jenis cuti wajib dipilih"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai harus YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai harus YYYY-MM-DD"),
  reason: z.string().min(3, "Alasan wajib diisi (min. 3 karakter)").max(2000),
  addressDuringLeave: z.string().max(500).optional(),
  contactNumber: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
  packageId: z.string().max(100).optional(),
  packageOrder: z.number().int().min(1).max(2).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user.employee) {
      throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
    }
    const body = createSchema.parse(await req.json());

    let start: Date;
    let end: Date;
    try {
      start = parseISODate(body.startDate);
      end = parseISODate(body.endDate);
    } catch {
      throw new ApiError("INVALID_DATE", "Tanggal tidak valid (gunakan format YYYY-MM-DD).", 422);
    }
    if (start > end) {
      throw new ApiError("INVALID_RANGE", "Tanggal mulai tidak boleh setelah tanggal selesai.", 422);
    }

    const leaveType = await db.leaveType.findUnique({ where: { id: body.leaveTypeId } });
    if (!leaveType || !leaveType.isActive) {
      throw new ApiError("NOT_FOUND", "Jenis cuti tidak ditemukan atau tidak aktif.", 404);
    }

    // hitung preview totalDays (aturan hitung hari dari validation service)
    const settings = await loadValidationSettings();
    const hds = await db.holiday.findMany({ where: { date: { gte: start, lte: end } } });
    const holidays = new Map(hds.map((h) => [toISODate(h.date), h.countsAsLeaveDay]));
    const totalDays = computeLeaveDays(start, end, holidays, settings.COUNT_WEEKEND_AS_LEAVE);

    const created = await db.leaveRequest.create({
      data: {
        employee: { connect: { id: user.employee.id } },
        leaveType: { connect: { id: body.leaveTypeId } },
        packageId: body.packageId ?? null,
        packageOrder: body.packageOrder ?? null,
        startDate: start,
        endDate: end,
        totalDays,
        reason: body.reason.trim(),
        addressDuringLeave: body.addressDuringLeave?.trim() || null,
        contactNumber: body.contactNumber?.trim() || null,
        notes: body.notes?.trim() || null,
        status: "DRAFT",
      },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_LEAVE_REQUEST",
      entityType: "LeaveRequest",
      entityId: created.id,
      newValue: {
        leaveTypeId: body.leaveTypeId,
        startDate: body.startDate,
        endDate: body.endDate,
        totalDays,
      },
      ...getRequestMeta(req),
    });

    return ok({ request: created }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
