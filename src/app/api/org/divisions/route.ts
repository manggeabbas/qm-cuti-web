import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

/** Bentuk respons publik divisi. */
export function mapDivision(d: { id: number; code: string; name: string; isActive: boolean; createdAt: Date }) {
  return { id: d.id, code: d.code, name: d.name, parent: null, isActive: d.isActive, createdAt: d.createdAt };
}

/** GET /api/org/divisions?search=&page=&limit= — semua user login boleh baca */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;

    const where: Prisma.DivisionWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      db.division.count({ where }),
      db.division.findMany({ where, orderBy: { name: "asc" }, skip, take: limit }),
    ]);
    return ok(paged(rows.map(mapDivision), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createDivisionSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
});

/** POST /api/org/divisions — tambah divisi (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createDivisionSchema.parse(await req.json());

    const created = await db.division.create({ data: { code: body.code, name: body.name } });

    await auditLog({
      userId: user.id,
      action: "CREATE_DIVISION",
      entityType: "Division",
      entityId: created.id,
      newValue: mapDivision(created),
      ...getRequestMeta(req),
    });
    return ok(mapDivision(created), 201);
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
