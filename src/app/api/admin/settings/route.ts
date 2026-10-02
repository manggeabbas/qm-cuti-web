import db from "@/lib/db";
import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { invalidateSettingsCache } from "@/lib/settings";

/** GET /api/admin/settings — semua system setting (tanpa pagination) */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");

    const rows = await db.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    return ok(
      rows.map((r) => ({
        key: r.key,
        value: r.value,
        description: r.description,
      })),
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}

const upsertSettingSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
});

/** PUT /api/admin/settings — ubah/buat satu setting */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");

    const body = upsertSettingSchema.parse(await req.json());

    const existing = await db.systemSetting.findUnique({
      where: { key: body.key },
    });

    const saved = existing
      ? await db.systemSetting.update({
          where: { key: body.key },
          data: { value: body.value },
        })
      : await db.systemSetting.create({
          data: { key: body.key, value: body.value, description: null },
        });

    invalidateSettingsCache();

    await auditLog({
      userId: user.id,
      action: "CHANGE_SETTING",
      entityType: "SystemSetting",
      entityId: body.key,
      oldValue: { value: existing?.value ?? null },
      newValue: { value: body.value },
      ...getRequestMeta(req),
    });

    return ok({
      key: saved.key,
      value: saved.value,
      description: saved.description,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
