import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { generateRoster, generateRosterForPeriod } from "@/lib/scheduling";
import { applyAutoLock } from "@/lib/shift-periods";
import { parseISODate, toISODate } from "@/lib/dates";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama periode wajib diisi.").max(120),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  templateId: z.number().int().nullish(),
  periodLengthDays: z.number().int().min(1).max(60).optional(),
  startPeriodOrder: z.number().int().min(1).optional(),
});

/** GET /api/shifts/periods — daftar periode jadwal (terapkan auto-lock dulu) */
export async function GET() {
  try {
    await requireUser();
    await applyAutoLock();
    const rows = await db.shiftSchedulePeriod.findMany({
      include: {
        template: { select: { id: true, name: true, version: true } },
        _count: { select: { rosters: true } },
      },
      orderBy: { from: "desc" },
    });
    return ok({
      items: rows.map((p) => ({
        ...p,
        from: toISODate(p.from),
        to: toISODate(p.to),
      })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * POST /api/shifts/periods — buat periode (DRAFT) + generate roster.
 * Tanpa templateId: memakai rotasi bawaan (kompatibel perilaku lama).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const body = createSchema.parse(await req.json());
    const from = parseISODate(body.from);
    const to = parseISODate(body.to);
    if (from > to) return fail("INVALID_INPUT", "Tanggal mulai harus <= tanggal selesai.", 422);

    let templateVersion: number | null = null;
    if (body.templateId) {
      const tpl = await db.shiftRotationTemplate.findUnique({ where: { id: body.templateId } });
      if (!tpl || !tpl.isActive) return fail("NOT_FOUND", "Template tidak ditemukan / tidak aktif.", 404);
      templateVersion = tpl.version;
    }

    const period = await db.shiftSchedulePeriod.create({
      data: {
        name: body.name,
        from,
        to,
        templateId: body.templateId ?? null,
        templateVersion,
        status: "DRAFT",
        createdBy: user.id,
      },
    });

    let created = 0;
    if (body.templateId) {
      ({ created } = await generateRosterForPeriod(
        period.id, from, to, body.templateId,
        body.periodLengthDays ?? 7, body.startPeriodOrder ?? 1,
      ));
    } else {
      ({ created } = await generateRoster(from, to, period.id));
    }

    await auditLog({
      userId: user.id, action: "CREATE_SHIFT_PERIOD", entityType: "ShiftSchedulePeriod",
      entityId: period.id, newValue: { name: period.name, created }, ...getRequestMeta(req),
    });
    return ok({ period: { ...period, from: body.from, to: body.to }, created }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}
