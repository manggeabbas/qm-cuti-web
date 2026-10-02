import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate, toISODate } from "@/lib/dates";

export function mapHoliday(h: { id: number; date: Date; name: string; countsAsLeaveDay: boolean }) {
  return { id: h.id, date: toISODate(h.date), name: h.name, countsAsLeaveDay: h.countsAsLeaveDay };
}

/** GET /api/holidays?search=&year=&page=&limit= */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;

    const yearRaw = sp.get("year");
    let year: number | undefined;
    if (yearRaw) {
      year = Number(yearRaw);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return fail("INVALID_INPUT", "Parameter year tidak valid.", 400);
      }
    }

    const where: Prisma.HolidayWhereInput = {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(year !== undefined
        ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.holiday.count({ where }),
      db.holiday.findMany({ where, orderBy: { date: "asc" }, skip, take: limit }),
    ]);
    return ok(paged(rows.map(mapHoliday), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  countsAsLeaveDay: z.boolean().default(false),
});

// Schema update tanpa default agar field yang tidak dikirim tidak tertimpa nilai default.
export const updateHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.").optional(),
  name: z.string().trim().min(1, "Nama wajib diisi.").optional(),
  countsAsLeaveDay: z.boolean().optional(),
});

/** POST /api/holidays — tambah hari libur (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createHolidaySchema.parse(await req.json());

    let date: Date;
    try {
      date = parseISODate(body.date);
    } catch (e) {
      return fail("INVALID_INPUT", e instanceof Error ? e.message : "Tanggal tidak valid.", 400);
    }

    const created = await db.holiday.create({
      data: { date, name: body.name, countsAsLeaveDay: body.countsAsLeaveDay },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_HOLIDAY",
      entityType: "Holiday",
      entityId: created.id,
      newValue: mapHoliday(created),
      ...getRequestMeta(req),
    });
    return ok(mapHoliday(created), 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("DUPLICATE", "Tanggal sudah terdaftar sebagai hari libur.", 409);
    }
    return toErrorResponse(e);
  }
}
