import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

export function mapLeaveType(lt: {
  id: number;
  code: string;
  name: string;
  category: string;
  defaultDays: number | null;
  eligibilityMonths: number | null;
  maxSingleDays: number | null;
  maxCombinedWithCfv: number | null;
  requiresAttachment: boolean;
  consumesBalance: boolean;
  countsAsLeaveDay: boolean;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    id: lt.id,
    code: lt.code,
    name: lt.name,
    category: lt.category,
    defaultDays: lt.defaultDays,
    eligibilityMonths: lt.eligibilityMonths,
    maxSingleDays: lt.maxSingleDays,
    maxCombinedWithCfv: lt.maxCombinedWithCfv,
    requiresAttachment: lt.requiresAttachment,
    consumesBalance: lt.consumesBalance,
    countsAsLeaveDay: lt.countsAsLeaveDay,
    isActive: lt.isActive,
    sortOrder: lt.sortOrder,
  };
}

/** GET /api/leave-types?search=&page=&limit= */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;

    const where: Prisma.LeaveTypeWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      db.leaveType.count({ where }),
      db.leaveType.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows.map(mapLeaveType), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createLeaveTypeSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  category: z.enum(["CFV", "CT", "SPECIAL_LEAVE", "PERMISSION"]),
  defaultDays: z.number().int().positive().nullish(),
  eligibilityMonths: z.number().int().nonnegative().nullish(),
  maxSingleDays: z.number().int().positive().nullish(),
  maxCombinedWithCfv: z.number().int().positive().nullish(),
  requiresAttachment: z.boolean().default(false),
  consumesBalance: z.boolean().default(true),
  countsAsLeaveDay: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// Schema update tanpa default agar field yang tidak dikirim tidak tertimpa nilai default.
export const updateLeaveTypeSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi.").optional(),
  name: z.string().trim().min(1, "Nama wajib diisi.").optional(),
  category: z.enum(["CFV", "CT", "SPECIAL_LEAVE", "PERMISSION"]).optional(),
  defaultDays: z.number().int().positive().nullish(),
  eligibilityMonths: z.number().int().nonnegative().nullish(),
  maxSingleDays: z.number().int().positive().nullish(),
  maxCombinedWithCfv: z.number().int().positive().nullish(),
  requiresAttachment: z.boolean().optional(),
  consumesBalance: z.boolean().optional(),
  countsAsLeaveDay: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** POST /api/leave-types — tambah jenis cuti (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createLeaveTypeSchema.parse(await req.json());

    const created = await db.leaveType.create({
      data: {
        code: body.code,
        name: body.name,
        category: body.category,
        defaultDays: body.defaultDays ?? null,
        eligibilityMonths: body.eligibilityMonths ?? null,
        maxSingleDays: body.maxSingleDays ?? null,
        maxCombinedWithCfv: body.maxCombinedWithCfv ?? null,
        requiresAttachment: body.requiresAttachment,
        consumesBalance: body.consumesBalance,
        countsAsLeaveDay: body.countsAsLeaveDay,
        isActive: body.isActive,
        sortOrder: body.sortOrder,
      },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_LEAVE_TYPE",
      entityType: "LeaveType",
      entityId: created.id,
      newValue: mapLeaveType(created),
      ...getRequestMeta(req),
    });
    return ok(mapLeaveType(created), 201);
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
