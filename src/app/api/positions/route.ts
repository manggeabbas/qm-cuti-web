import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

export function mapPosition(p: {
  id: number;
  code: string;
  name: string;
  levelOrder: number;
  isOperationalGroup: boolean;
  isActive: boolean;
}) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    levelOrder: p.levelOrder,
    isOperationalGroup: p.isOperationalGroup,
    isActive: p.isActive,
  };
}

/** GET /api/positions?search=&page=&limit= */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;

    const where: Prisma.PositionWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      db.position.count({ where }),
      db.position.findMany({ where, orderBy: { name: "asc" }, skip, take: limit }),
    ]);
    return ok(paged(rows.map(mapPosition), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createPositionSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  levelOrder: z.number().int().default(0),
  isOperationalGroup: z.boolean().default(false),
});

// Schema update tanpa default agar field yang tidak dikirim tidak tertimpa nilai default.
export const updatePositionSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi.").optional(),
  name: z.string().trim().min(1, "Nama wajib diisi.").optional(),
  levelOrder: z.number().int().optional(),
  isOperationalGroup: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** POST /api/positions — tambah jabatan (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createPositionSchema.parse(await req.json());

    const created = await db.position.create({
      data: {
        code: body.code,
        name: body.name,
        levelOrder: body.levelOrder,
        isOperationalGroup: body.isOperationalGroup,
      },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_POSITION",
      entityType: "Position",
      entityId: created.id,
      newValue: mapPosition(created),
      ...getRequestMeta(req),
    });
    return ok(mapPosition(created), 201);
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
