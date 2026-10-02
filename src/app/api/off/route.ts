import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasRole } from "@/lib/role-utils";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { validateOffRequest } from "@/lib/scheduling";
import { parseISODate, toISODate } from "@/lib/dates";

/** GET /api/off?from=&to=&teamId=&employeeId= */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const from = sp.get("from") ? parseISODate(sp.get("from") as string) : undefined;
    const to = sp.get("to") ? parseISODate(sp.get("to") as string) : undefined;
    const teamId = sp.get("teamId") ? Number(sp.get("teamId")) : undefined;
    let employeeId = sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined;

    // Employee biasa hanya boleh lihat milik sendiri
    if (!hasRole(user, "ADMIN", "SPV", "FOREMAN", "WAFOR", "KOORDINATOR")) {
      employeeId = user.employeeId ?? undefined;
    }
    const where = {
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(teamId ? { employee: { teamId } } : {}),
      ...(employeeId ? { employeeId } : {}),
    };
    const [total, rows] = await Promise.all([
      db.offSchedule.count({ where }),
      db.offSchedule.findMany({
        where,
        include: { employee: { select: { id: true, name: true, nik: true, team: { select: { code: true, name: true } } } } },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows, total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

const createSchema = z.object({
  employeeId: z.number().int().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"),
  note: z.string().max(200).optional(),
});

/** POST /api/off — ajukan OFF individu */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());
    let employeeId = body.employeeId;

    if (!hasRole(user, "ADMIN", "FOREMAN", "WAFOR", "SPV")) {
      // karyawan hanya untuk diri sendiri
      if (!user.employeeId) throw new ApiError("FORBIDDEN", "Akun Anda tidak terhubung ke data karyawan.", 403);
      employeeId = user.employeeId;
    }
    if (!employeeId) throw new ApiError("VALIDATION_ERROR", "employeeId wajib diisi.", 422);

    const date = parseISODate(body.date);
    const issues = await validateOffRequest(employeeId, date);
    const errors = issues.filter((i) => i.severity === "ERROR");
    if (errors.length > 0) {
      return fail("VALIDATION_FAILED", errors.map((e) => e.message).join(" "), 422);
    }
    const warnings = issues.filter((i) => i.severity === "WARN");

    const row = await db.offSchedule.create({
      data: { employeeId, date, kind: "INDIVIDUAL", note: body.note },
    });
    await auditLog({
      userId: user.id, action: "CREATE_OFF", entityType: "OffSchedule", entityId: row.id,
      newValue: { employeeId, date: toISODate(date) }, ...getRequestMeta(req),
    });
    return ok({ off: row, warnings: warnings.map((w) => w.message) }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid", 422);
    return toErrorResponse(e);
  }
}
