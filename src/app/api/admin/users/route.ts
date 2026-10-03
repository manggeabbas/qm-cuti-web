import db from "@/lib/db";
import { z } from "zod";
import { Prisma, type RoleName } from "@prisma/client";
import {
  ok,
  fail,
  toErrorResponse,
  getPagination,
  paged,
} from "@/lib/api";
import { requireUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

const ROLE_NAMES = [
  "ADMIN",
  "SPV",
  "WSPV",
  "FOREMAN",
  "WAFOR",
  "KOORDINATOR",
  "EMPLOYEE",
] as const;

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    roles: { include: { role: true } };
    employee: { select: { id: true; nik: true; name: true } };
  };
}>;

function shapeUser(u: UserWithRelations) {
  return {
    id: u.id,
    username: u.username,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    roles: u.roles.map((r) => r.role.name),
    employee: u.employee
      ? { id: u.employee.id, nik: u.employee.nik, name: u.employee.name }
      : null,
    createdAt: u.createdAt,
  };
}

const createUserSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(6),
  role: z.enum(ROLE_NAMES),
  employeeId: z.number().int().nullish(),
});

/** GET /api/admin/users — daftar user (tanpa passwordHash) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");

    const searchParams = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(searchParams);
    const search = searchParams.get("search")?.trim() || null;

    const where: Prisma.UserWhereInput = search
      ? { username: { contains: search, mode: "insensitive" } }
      : {};

    const [total, rows] = await db.$transaction([
      db.user.count({ where }),
      db.user.findMany({
        where,
        include: {
          roles: { include: { role: true } },
          employee: { select: { id: true, nik: true, name: true } },
        },
        orderBy: { username: "asc" },
        skip,
        take: limit,
      }),
    ]);

    return ok(paged(rows.map(shapeUser), total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** POST /api/admin/users — buat user baru */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");

    const body = createUserSchema.parse(await req.json());
    const roleName = body.role as RoleName;

    // Username harus unik
    const existing = await db.user.findUnique({
      where: { username: body.username },
    });
    if (existing) {
      return fail("DUPLICATE", "Username sudah digunakan.", 409);
    }

    // employeeId (jika diisi) harus ada dan belum punya akun
    if (body.employeeId != null) {
      const employee = await db.employee.findUnique({
        where: { id: body.employeeId },
        include: { user: { select: { id: true } } },
      });
      if (!employee) {
        return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);
      }
      if (employee.user) {
        return fail("DUPLICATE", "Karyawan sudah memiliki akun.", 409);
      }
    }

    const roleRow = await db.role.findUnique({ where: { name: roleName } });
    if (!roleRow) {
      return fail("NOT_FOUND", "Role tidak ditemukan.", 404);
    }

    const passwordHash = await hashPassword(body.password);

    let createdId: number;
    try {
      createdId = await db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            username: body.username,
            passwordHash,
            employeeId: body.employeeId ?? null,
          },
        });
        await tx.userRole.create({
          data: { userId: u.id, roleId: roleRow.id },
        });
        return u.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        if (target.includes("employeeId")) {
          return fail("DUPLICATE", "Karyawan sudah memiliki akun.", 409);
        }
        return fail("DUPLICATE", "Username sudah digunakan.", 409);
      }
      throw e;
    }

    const created = (await db.user.findUnique({
      where: { id: createdId },
      include: {
        roles: { include: { role: true } },
        employee: { select: { id: true, nik: true, name: true } },
      },
    })) as UserWithRelations | null;
    if (!created) return fail("NOT_FOUND", "User tidak ditemukan.", 404);

    await auditLog({
      userId: user.id,
      action: "CREATE_USER",
      entityType: "User",
      entityId: created.id,
      newValue: { username: created.username, role: body.role },
      ...getRequestMeta(req),
    });

    return ok(shapeUser(created), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
