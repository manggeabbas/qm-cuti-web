import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

type Parent = { id: number; code: string; name: string } | null;

export function mapSection(
  s: { id: number; code: string; name: string; isActive: boolean; createdAt: Date },
  parent: Parent,
) {
  return { id: s.id, code: s.code, name: s.name, parent, isActive: s.isActive, createdAt: s.createdAt };
}

/** GET /api/org/sections?search=&parentId=&page=&limit= */
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

    const where: Prisma.SectionWhereInput = {
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
      db.section.count({ where }),
      db.section.findMany({
        where,
        include: { department: { select: { id: true, code: true, name: true } } },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(
      paged(
        rows.map((r) => mapSection(r, r.department)),
        total,
        page,
        limit,
      ),
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createSectionSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  parentId: z.number().int(),
});

/** POST /api/org/sections — tambah seksi (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createSectionSchema.parse(await req.json());

    const parent = await db.department.findUnique({ where: { id: body.parentId } });
    if (!parent) return fail("INVALID_INPUT", "Departemen induk tidak ditemukan.", 400);

    const created = await db.section.create({
      data: { code: body.code, name: body.name, departmentId: body.parentId },
      include: { department: { select: { id: true, code: true, name: true } } },
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_SECTION",
      entityType: "Section",
      entityId: created.id,
      newValue: mapSection(created, created.department),
      ...getRequestMeta(req),
    });
    return ok(mapSection(created, created.department), 201);
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
