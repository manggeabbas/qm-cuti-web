import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { getNumberSetting } from "@/lib/settings";

export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** GET /api/off/me — hari OFF mingguan karyawan yang login + sebaran regu. */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user.employeeId) {
      throw new ApiError("FORBIDDEN", "Akun Anda tidak terhubung ke data karyawan.", 403);
    }
    const emp = await db.employee.findUnique({
      where: { id: user.employeeId },
      select: { offDayOfWeek: true, teamId: true },
    });
    const mates = await db.employee.findMany({
      where: { teamId: emp?.teamId ?? -1, status: "ACTIVE" },
      select: { offDayOfWeek: true },
    });
    const teamCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const m of mates) {
      if (m.offDayOfWeek != null) teamCounts[m.offDayOfWeek] += 1;
    }
    return ok({ offDayOfWeek: emp?.offDayOfWeek ?? null, teamCounts });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const putSchema = z.object({
  offDayOfWeek: z.number().int().min(0).max(6).nullable(),
});

/** PUT /api/off/me — tetapkan hari OFF mingguan (Rabu tidak boleh). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (!user.employeeId) {
      throw new ApiError("FORBIDDEN", "Akun Anda tidak terhubung ke data karyawan.", 403);
    }
    const body = putSchema.parse(await req.json());

    if (body.offDayOfWeek === 3) {
      return fail("INVALID_INPUT", "Rabu adalah OFF bersama, tidak perlu ditetapkan.", 422);
    }

    const warnings: string[] = [];
    const emp = await db.employee.findUnique({
      where: { id: user.employeeId },
      include: { team: { include: { employees: { where: { status: "ACTIVE" }, select: { id: true } } } } },
    });
    if (!emp) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

    if (body.offDayOfWeek != null) {
      const teamSize = emp.team.employees.length;
      const threshold = await getNumberSetting("TEAM_LARGE_THRESHOLD", 7);
      const limit =
        teamSize >= threshold
          ? await getNumberSetting("TEAM_OFF_LIMIT_LARGE", 2)
          : await getNumberSetting("TEAM_OFF_LIMIT_SMALL", 1);
      const count = await db.employee.count({
        where: {
          teamId: emp.teamId,
          status: "ACTIVE",
          offDayOfWeek: body.offDayOfWeek,
          id: { not: user.employeeId },
        },
      });
      if (count >= limit) {
        warnings.push(
          `Sudah ada ${count} anggota regu OFF pada hari ${DAY_NAMES[body.offDayOfWeek]} (batas ${limit} orang/hari).`,
        );
      }
    }

    const before = emp.offDayOfWeek;
    await db.employee.update({
      where: { id: user.employeeId },
      data: { offDayOfWeek: body.offDayOfWeek },
    });

    await auditLog({
      userId: user.id,
      action: "SET_OFF_DAY",
      entityType: "Employee",
      entityId: user.employeeId,
      oldValue: { offDayOfWeek: before },
      newValue: { offDayOfWeek: body.offDayOfWeek },
      ...getRequestMeta(req),
    });

    return ok({ offDayOfWeek: body.offDayOfWeek, warnings });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
