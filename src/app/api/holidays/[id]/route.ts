import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate } from "@/lib/dates";
import { mapHoliday, updateHolidaySchema } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/holidays/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const row = await db.holiday.findUnique({ where: { id: Number(id) } });
    if (!row) return fail("NOT_FOUND", "Hari libur tidak ditemukan.", 404);
    return ok(mapHoliday(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/holidays/[id] (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const holId = Number(id);
    const body = updateHolidaySchema.parse(await req.json());

    const existing = await db.holiday.findUnique({ where: { id: holId } });
    if (!existing) return fail("NOT_FOUND", "Hari libur tidak ditemukan.", 404);

    let date: Date | undefined;
    if (body.date !== undefined) {
      try {
        date = parseISODate(body.date);
      } catch (e) {
        return fail("INVALID_INPUT", e instanceof Error ? e.message : "Tanggal tidak valid.", 400);
      }
    }

    const updated = await db.holiday.update({
      where: { id: holId },
      data: {
        ...(date !== undefined ? { date } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.countsAsLeaveDay !== undefined ? { countsAsLeaveDay: body.countsAsLeaveDay } : {}),
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_HOLIDAY",
      entityType: "Holiday",
      entityId: holId,
      oldValue: mapHoliday(existing),
      newValue: mapHoliday(updated),
      ...getRequestMeta(req),
    });
    return ok(mapHoliday(updated));
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

/** DELETE /api/holidays/[id] (ADMIN) — langsung hapus, tidak ada relasi */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const holId = Number(id);

    const existing = await db.holiday.findUnique({ where: { id: holId } });
    if (!existing) return fail("NOT_FOUND", "Hari libur tidak ditemukan.", 404);

    await db.holiday.delete({ where: { id: holId } });

    await auditLog({
      userId: user.id,
      action: "DELETE_HOLIDAY",
      entityType: "Holiday",
      entityId: holId,
      oldValue: mapHoliday(existing),
      ...getRequestMeta(req),
    });
    return ok({ message: "Hari libur dihapus." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
