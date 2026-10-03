import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { z } from "zod";

const itemSchema = z.object({
  periodOrder: z.number().int().min(1),
  teamId: z.number().int(),
  shiftTypeId: z.number().int(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama template wajib diisi.").max(120),
  description: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).min(1, "Minimal 1 item rotasi."),
});

/** GET /api/shifts/templates — daftar template rotasi (semua user login bisa lihat) */
export async function GET() {
  try {
    await requireUser();
    const rows = await db.shiftRotationTemplate.findMany({
      include: {
        items: {
          include: {
            team: { select: { id: true, code: true, name: true } },
            shiftType: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ periodOrder: "asc" }, { teamId: "asc" }],
        },
        _count: { select: { periods: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return ok({ items: rows });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** POST /api/shifts/templates — buat template (ADMIN/SPV/WSPV/FOREMAN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV", "FOREMAN");
    const body = createSchema.parse(await req.json());

    // validasi FK
    const teamIds = [...new Set(body.items.map((i) => i.teamId))];
    const shiftIds = [...new Set(body.items.map((i) => i.shiftTypeId))];
    const [teams, shifts] = await Promise.all([
      db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true } }),
      db.shiftType.findMany({ where: { id: { in: shiftIds } }, select: { id: true } }),
    ]);
    if (teams.length !== teamIds.length) return fail("INVALID_INPUT", "Ada regu tidak ditemukan.", 404);
    if (shifts.length !== shiftIds.length) return fail("INVALID_INPUT", "Ada shift tidak ditemukan.", 404);

    const created = await db.shiftRotationTemplate.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        isActive: body.isActive ?? true,
        items: { create: body.items },
      },
      include: { items: true },
    });
    await auditLog({
      userId: user.id, action: "CREATE_SHIFT_TEMPLATE", entityType: "ShiftRotationTemplate",
      entityId: created.id, newValue: { name: created.name }, ...getRequestMeta(req),
    });
    return ok(created, 201);
  } catch (e) {
    if (e instanceof z.ZodError) return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    return toErrorResponse(e);
  }
}
