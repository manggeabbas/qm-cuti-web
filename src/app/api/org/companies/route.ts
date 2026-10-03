import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

/** Bentuk respons publik perusahaan (level teratas, tanpa induk). */
export function mapCompany(c: { id: number; code: string; name: string; isActive: boolean; createdAt: Date }) {
  return { id: c.id, code: c.code, name: c.name, parent: null, isActive: c.isActive, createdAt: c.createdAt };
}

/** GET /api/org/companies?search=&page=&limit= — semua user login boleh baca */
export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const search = sp.get("search")?.trim() || undefined;

    const where: Prisma.CompanyWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      db.company.count({ where }),
      db.company.findMany({ where, orderBy: { name: "asc" }, skip, take: limit }),
    ]);
    return ok(paged(rows.map(mapCompany), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createCompanySchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
});

/** POST /api/org/companies — tambah perusahaan (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createCompanySchema.parse(await req.json());

    const created = await db.company.create({ data: { code: body.code, name: body.name } });

    await auditLog({
      userId: user.id,
      action: "CREATE_COMPANY",
      entityType: "Company",
      entityId: created.id,
      newValue: mapCompany(created),
      ...getRequestMeta(req),
    });
    return ok(mapCompany(created), 201);
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
