import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

type Parent = { id: number; code: string; name: string } | null;

/** Bentuk respons publik divisi (induk: Departemen). */
export function mapDivision(
  d: { id: number; code: string; name: string; isActive: boolean; createdAt: Date },
  parent: Parent,
) {
  return { id: d.id, code: d.code, name: d.name, parent, isActive: d.isActive, createdAt: d.createdAt };
}

const parentSelect = { select: { id: true, code: true, name: true } } as const;

/** GET /api/org/divisions?search=&parentId=&page=&limit= — semua user login boleh baca */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;
    const parentId = sp.get("parentId") ? Number(sp.get("parentId")) : undefined;
    if (parentId !== undefined && !Number.isInteger(parentId)) {
      return fail("INVALID_INPUT", "parentId tidak valid.", 400);
    }

    const where: Prisma.DivisionWhereInput = {
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(parentId !== undefined ? { departmentId: parentId } : {}),
    };

    const [total, rows] = await Promise.all([
      db.division.count({ where }),
      db.division.findMany({
        where,
        include: { department: parentSelect },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows.map((r) => mapDivision(r, r.department)), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createDivisionSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  parentId: z.number().int(),
});

/** POST /api/org/divisions — tambah divisi (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createDivisionSchema.parse(await req.json());

    const parent = await db.department.findUnique({ where: { id: body.parentId } });
    if (!parent) return fail("INVALID_INPUT", "Departemen induk tidak ditemukan.", 400);

    const created = await db.division.create({
      data: { code: body.code, name: body.name, departmentId: body.parentId },
      include: { department: parentSelect },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_DIVISION",
      entityType: "Division",
      entityId: created.id,
      newValue: mapDivision(created, created.department),
      ...getRequestMeta(req),
    });
    return ok(mapDivision(created, created.department), 201);
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
