import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate } from "@/lib/dates";
import { mapEmployee, createEmployeeSchema } from "../route";

const updateEmployeeSchema = createEmployeeSchema.partial();

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/employees/[id] */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "SPV", "FOREMAN", "WAFOR", "KOORDINATOR");
    const { id } = await ctx.params;
    const row = await db.employee.findUnique({
      where: { id: Number(id) },
      include: {
        position: { select: { name: true } },
        division: { select: { name: true } },
        department: { select: { name: true } },
        section: { select: { name: true } },
        team: { select: { name: true } },
        supervisor: { select: { id: true, nik: true, name: true } },
      },
    });
    if (!row) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);
    return ok(mapEmployee(row));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** PUT /api/employees/[id] — ubah karyawan (ADMIN) */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const empId = Number(id);
    const body = updateEmployeeSchema.parse(await req.json());

    const existing = await db.employee.findUnique({ where: { id: empId } });
    if (!existing) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

    // NIK berubah → cek duplikat
    if (body.nik !== undefined && body.nik !== existing.nik) {
      const dup = await db.employee.findUnique({ where: { nik: body.nik } });
      if (dup) return fail("DUPLICATE", "NIK sudah terdaftar.", 409);
    }

    // Tidak boleh menjadi atasan diri sendiri
    if (body.supervisorId !== undefined && body.supervisorId !== null && body.supervisorId === empId) {
      return fail("INVALID_INPUT", "Karyawan tidak boleh menjadi atasannya sendiri.", 400);
    }

    let effectiveDate: Date | undefined;
    if (body.effectiveDate !== undefined) {
      try {
        effectiveDate = parseISODate(body.effectiveDate);
      } catch (e) {
        return fail("INVALID_INPUT", e instanceof Error ? e.message : "Tanggal efektif tidak valid.", 400);
      }
    }

    // Validasi FK yang diubah
    if (body.positionId !== undefined) {
      const p = await db.position.findUnique({ where: { id: body.positionId } });
      if (!p) return fail("INVALID_INPUT", "Jabatan tidak ditemukan.", 400);
    }
    if (body.divisionId !== undefined) {
      const d = await db.division.findUnique({ where: { id: body.divisionId } });
      if (!d) return fail("INVALID_INPUT", "Divisi tidak ditemukan.", 400);
    }
    if (body.departmentId !== undefined) {
      const d = await db.department.findUnique({ where: { id: body.departmentId } });
      if (!d) return fail("INVALID_INPUT", "Departemen tidak ditemukan.", 400);
    }
    if (body.sectionId !== undefined) {
      const s = await db.section.findUnique({ where: { id: body.sectionId } });
      if (!s) return fail("INVALID_INPUT", "Seksi tidak ditemukan.", 400);
    }
    if (body.teamId !== undefined) {
      const t = await db.team.findUnique({ where: { id: body.teamId } });
      if (!t) return fail("INVALID_INPUT", "Regu tidak ditemukan.", 400);
    }
    if (body.supervisorId !== undefined && body.supervisorId !== null) {
      const s = await db.employee.findUnique({ where: { id: body.supervisorId } });
      if (!s) return fail("INVALID_INPUT", "Atasan tidak ditemukan.", 400);
    }

    const data: Prisma.EmployeeUncheckedUpdateInput = {};
    if (body.nik !== undefined) data.nik = body.nik;
    if (body.name !== undefined) data.name = body.name;
    if (effectiveDate !== undefined) data.effectiveDate = effectiveDate;
    if (body.positionId !== undefined) data.positionId = body.positionId;
    if (body.level !== undefined) data.level = body.level;
    if (body.divisionId !== undefined) data.divisionId = body.divisionId;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId;
    if (body.sectionId !== undefined) data.sectionId = body.sectionId;
    if (body.teamId !== undefined) data.teamId = body.teamId;
    if (body.supervisorId !== undefined) data.supervisorId = body.supervisorId;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.status !== undefined) data.status = body.status;

    const updated = await db.employee.update({
      where: { id: empId },
      data,
      include: {
        position: { select: { name: true } },
        division: { select: { name: true } },
        department: { select: { name: true } },
        section: { select: { name: true } },
        team: { select: { name: true } },
        supervisor: { select: { id: true, nik: true, name: true } },
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPDATE_EMPLOYEE",
      entityType: "Employee",
      entityId: empId,
      oldValue: { nik: existing.nik, name: existing.name, status: existing.status },
      newValue: mapEmployee(updated),
      ...getRequestMeta(req),
    });
    return ok(mapEmployee(updated));
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("DUPLICATE", "NIK sudah terdaftar.", 409);
    }
    return toErrorResponse(e);
  }
}

/** DELETE /api/employees/[id] — nonaktifkan karyawan / soft delete (ADMIN) */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const { id } = await ctx.params;
    const empId = Number(id);

    const existing = await db.employee.findUnique({ where: { id: empId } });
    if (!existing) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

    const updated = await db.employee.update({
      where: { id: empId },
      data: { status: "INACTIVE" },
      include: {
        position: { select: { name: true } },
        division: { select: { name: true } },
        department: { select: { name: true } },
        section: { select: { name: true } },
        team: { select: { name: true } },
        supervisor: { select: { id: true, nik: true, name: true } },
      },
    });

    await auditLog({
      userId: user.id,
      action: "DEACTIVATE_EMPLOYEE",
      entityType: "Employee",
      entityId: empId,
      oldValue: { status: existing.status },
      newValue: { status: "INACTIVE" },
      ...getRequestMeta(req),
    });
    return ok(mapEmployee(updated));
  } catch (e) {
    return toErrorResponse(e);
  }
}
