import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

type Parent = { id: number; code: string; name: string } | null;

/** Bentuk respons publik departemen (induk: Perusahaan). */
export function mapDepartment(
  d: { id: number; code: string; name: string; isActive: boolean; createdAt: Date },
  parent: Parent,
) {
  return { id: d.id, code: d.code, name: d.name, parent, isActive: d.isActive, createdAt: d.createdAt };
}

const parentSelect = { select: { id: true, code: true, name: true } } as const;

/** GET /api/org/departments?search=&parentId=&page=&limit= */
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

    const where: Prisma.DepartmentWhereInput = {
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(parentId !== undefined ? { companyId: parentId } : {}),
    };

    const [total, rows] = await Promise.all([
      db.department.count({ where }),
      db.department.findMany({
        where,
        include: { company: parentSelect },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows.map((r) => mapDepartment(r, r.company)), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createDepartmentSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  parentId: z.number().int(),
});

/** POST /api/org/departments — tambah departemen (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createDepartmentSchema.parse(await req.json());

    const parent = await db.company.findUnique({ where: { id: body.parentId } });
    if (!parent) return fail("INVALID_INPUT", "Perusahaan induk tidak ditemukan.", 400);

    const created = await db.department.create({
      data: { code: body.code, name: body.name, companyId: body.parentId },
      include: { company: parentSelect },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_DEPARTMENT",
      entityType: "Department",
      entityId: created.id,
      newValue: mapDepartment(created, created.company),
      ...getRequestMeta(req),
    });
    return ok(mapDepartment(created, created.company), 201);
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
