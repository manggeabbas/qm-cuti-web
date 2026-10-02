import db from "@/lib/db";
import { z } from "zod";
import { Prisma, type RoleName } from "@prisma/client";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";

const ROLE_NAMES = [
  "ADMIN",
  "SPV",
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

const userInclude = {
  roles: { include: { role: true } },
  employee: { select: { id: true, nik: true, name: true } },
} as const;

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

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError("NOT_FOUND", "User tidak ditemukan.", 404);
  }
  return id;
}

/** GET /api/admin/users/[id] — detail satu user */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);

    const row = await db.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!row) {
      return fail("NOT_FOUND", "User tidak ditemukan.", 404);
    }
    return ok(shapeUser(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateUserSchema = z.object({
  role: z.enum(ROLE_NAMES).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(6).optional(),
});

/** PUT /api/admin/users/[id] — ubah role / status aktif / reset password */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);

    const body = updateUserSchema.parse(await req.json());

    // Tolak menonaktifkan diri sendiri
    if (id === user.id && body.isActive === false) {
      return fail(
        "INVALID_INPUT",
        "Tidak dapat menonaktifkan akun sendiri.",
        400,
      );
    }

    const existing = await db.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!existing) {
      return fail("NOT_FOUND", "User tidak ditemukan.", 404);
    }

    const meta = getRequestMeta(req);
    const data: Prisma.UserUpdateInput = {};
    const oldRoles = existing.roles.map((r) => r.role.name);

    // 1) Ganti role: hapus semua UserRole lama, buat baru
    if (body.role) {
      const roleRow = await db.role.findUnique({
        where: { name: body.role as RoleName },
      });
      if (!roleRow) {
        return fail("NOT_FOUND", "Role tidak ditemukan.", 404);
      }
      await db.$transaction([
        db.userRole.deleteMany({ where: { userId: id } }),
        db.userRole.create({
          data: { userId: id, roleId: roleRow.id },
        }),
      ]);
      if (
        oldRoles.length !== 1 ||
        oldRoles[0] !== body.role
      ) {
        await auditLog({
          userId: user.id,
          action: "UPDATE_USER",
          entityType: "User",
          entityId: id,
          oldValue: { roles: oldRoles },
          newValue: { roles: [body.role] },
          ...meta,
        });
      }
    }

    // 2) Reset password
    if (body.newPassword) {
      data.passwordHash = await hashPassword(body.newPassword);
      await auditLog({
        userId: user.id,
        action: "RESET_PASSWORD",
        entityType: "User",
        entityId: id,
        newValue: { reset: true },
        ...meta,
      });
    }

    // 3) Ubah status aktif
    if (
      body.isActive !== undefined &&
      body.isActive !== existing.isActive
    ) {
      data.isActive = body.isActive;
      await auditLog({
        userId: user.id,
        action: "UPDATE_USER",
        entityType: "User",
        entityId: id,
        oldValue: { isActive: existing.isActive },
        newValue: { isActive: body.isActive },
        ...meta,
      });
    }

    const updated = await db.user.update({
      where: { id },
      data,
      include: userInclude,
    });

    return ok(shapeUser(updated));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** DELETE /api/admin/users/[id] — nonaktifkan akun (soft delete) */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);

    if (id === user.id) {
      return fail(
        "INVALID_INPUT",
        "Tidak dapat menonaktifkan akun sendiri.",
        400,
      );
    }

    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      return fail("NOT_FOUND", "User tidak ditemukan.", 404);
    }

    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    await auditLog({
      userId: user.id,
      action: "DEACTIVATE_USER",
      entityType: "User",
      entityId: id,
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: false },
      ...getRequestMeta(req),
    });

    return ok({ id, isActive: false });
  } catch (e) {
    return toErrorResponse(e);
  }
}
