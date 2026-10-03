import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { setSetting } from "@/lib/settings";
import { getShiftRotationConfig, WEEK_START_NAMES } from "@/lib/shifts";
import { toISODate } from "@/lib/dates";

const DAY = z.enum(WEEK_START_NAMES as [string, ...string[]]);

/** GET /api/shifts/rotation — konfigurasi pola rotasi + pilihan shift & regu */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "FOREMAN", "WAFOR");
    const [config, shiftTypes, teams] = await Promise.all([
      getShiftRotationConfig(),
      db.shiftType.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        include: { patterns: { select: { dayOfWeek: true, startTime: true, endTime: true } } },
      }),
      db.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    ]);
    return ok({
      config: {
        mode: config.mode,
        order: config.order,
        weekStart: WEEK_START_NAMES[config.weekStartDow] ?? "KAMIS",
        anchorDate: toISODate(config.anchorDate),
        anchorMap: config.anchorMap,
      },
      shiftTypes: shiftTypes.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        patterns: s.patterns,
      })),
      teams: teams.map((t) => ({ id: t.id, code: t.code, name: t.name })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const putSchema = z.object({
  mode: z.enum(["WEEKLY", "FIXED"]),
  order: z.array(z.string().trim().min(1)).min(1, "Urutan shift minimal 1."),
  weekStart: DAY,
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD."),
  anchorMap: z.record(z.string(), z.string()),
});

/** PUT /api/shifts/rotation — simpan pola rotasi */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "FOREMAN");
    const body = putSchema.parse(await req.json());

    const order = body.order.map((s) => s.trim().toUpperCase());

    // Pastikan kode shift pada urutan & pemetaan memang ada.
    const types = await db.shiftType.findMany({ where: { isActive: true }, select: { code: true } });
    const validCodes = new Set(types.map((t) => t.code.toUpperCase()));
    const invalid = [
      ...order.filter((c) => !validCodes.has(c)),
      ...Object.values(body.anchorMap).map((c) => c.toUpperCase()).filter((c) => !validCodes.has(c)),
    ];
    if (invalid.length > 0) {
      return fail("VALIDATION_ERROR", `Kode shift tidak dikenal: ${[...new Set(invalid)].join(", ")}.`, 422);
    }

    const before = await getShiftRotationConfig();

    await setSetting("SHIFT_ROTATION_MODE", body.mode, "Mode rotasi shift: WEEKLY atau FIXED");
    await setSetting("SHIFT_ROTATION_ORDER", order.join(","), "Urutan rotasi shift");
    await setSetting("SHIFT_WEEK_START", body.weekStart, "Hari awal minggu rotasi");
    await setSetting("SHIFT_ANCHOR_DATE", body.anchorDate, "Awal minggu acuan rotasi");
    await setSetting("SHIFT_ANCHOR_MAP", JSON.stringify(body.anchorMap), "Regu -> shift pada minggu acuan");

    const after = await getShiftRotationConfig();

    await auditLog({
      userId: user.id,
      action: "UPDATE_SHIFT_ROTATION",
      entityType: "SystemSetting",
      entityId: "SHIFT_ROTATION",
      oldValue: { ...before, anchorDate: toISODate(before.anchorDate) },
      newValue: { ...after, anchorDate: toISODate(after.anchorDate) },
      ...getRequestMeta(req),
    });

    return ok({
      config: {
        mode: after.mode,
        order: after.order,
        weekStart: WEEK_START_NAMES[after.weekStartDow] ?? "KAMIS",
        anchorDate: toISODate(after.anchorDate),
        anchorMap: after.anchorMap,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
