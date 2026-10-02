import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

const sectionChain = {
  section: {
    select: {
      id: true,
      code: true,
      name: true,
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          division: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} as const;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof sectionChain }> & {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
};

/** Bentuk respons publik regu, beserta rantai parent seksi→departemen→divisi. */
export function mapTeam(t: TeamRow) {
  const sec = t.section;
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    parent: { id: sec.id, code: sec.code, name: sec.name },
    section: {
      id: sec.id,
      code: sec.code,
      name: sec.name,
      department: {
        id: sec.department.id,
        code: sec.department.code,
        name: sec.department.name,
        division: {
          id: sec.department.division.id,
          code: sec.department.division.code,
          name: sec.department.division.name,
        },
      },
    },
    isActive: t.isActive,
    createdAt: t.createdAt,
  };
}

/** GET /api/org/teams?search=&parentId=&page=&limit= */
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

    const where: Prisma.TeamWhereInput = {
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(parentId !== undefined ? { sectionId: parentId } : {}),
    };

    const [total, rows] = await Promise.all([
      db.team.count({ where }),
      db.team.findMany({
        where,
        include: sectionChain,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows.map(mapTeam), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createTeamSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  parentId: z.number().int(),
});

/** POST /api/org/teams — tambah regu (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createTeamSchema.parse(await req.json());

    const parent = await db.section.findUnique({ where: { id: body.parentId } });
    if (!parent) return fail("INVALID_INPUT", "Seksi induk tidak ditemukan.", 400);

    const created = await db.team.create({
      data: { code: body.code, name: body.name, sectionId: body.parentId },
      include: sectionChain,
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_TEAM",
      entityType: "Team",
      entityId: created.id,
      newValue: mapTeam(created),
      ...getRequestMeta(req),
    });
    return ok(mapTeam(created), 201);
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
