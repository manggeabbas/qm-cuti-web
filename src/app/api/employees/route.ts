import { z } from "zod";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { EmployeeStatus } from "@prisma/client";
import { ok, fail, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { parseISODate, toISODate, todayUTC } from "@/lib/dates";
import { buildSchedule } from "@/lib/shifts";

const employeeInclude = {
  position: { select: { name: true } },
  division: { select: { name: true } },
  department: { select: { name: true } },
  section: { select: { name: true } },
  team: { select: { name: true } },
  supervisor: { select: { id: true, nik: true, name: true } },
} as const;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

/** Petakan baris Employee ke bentuk respons publik. */
export function mapEmployee(e: EmployeeRow) {
  return {
    id: e.id,
    nik: e.nik,
    name: e.name,
    effectiveDate: toISODate(e.effectiveDate),
    positionId: e.positionId,
    position: e.position.name,
    level: e.level,
    divisionId: e.divisionId,
    division: e.division.name,
    departmentId: e.departmentId,
    department: e.department.name,
    sectionId: e.sectionId,
    section: e.section.name,
    teamId: e.teamId,
    team: e.team.name,
    supervisorId: e.supervisorId,
    supervisor: e.supervisor
      ? { id: e.supervisor.id, nik: e.supervisor.nik, name: e.supervisor.name }
      : null,
    email: e.email,
    phone: e.phone,
    status: e.status,
    offLocked: e.offLocked,
    offDayOfWeek: e.offDayOfWeek,
  };
}

/** GET /api/employees?search=&status=&teamId=&positionId=&page=&limit= */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "SPV", "WSPV", "FOREMAN", "WAFOR", "KOORDINATOR");
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);

    const search = sp.get("search")?.trim() || undefined;

    const statusParam = sp.get("status");
    let status: EmployeeStatus | undefined;
    if (statusParam) {
      if (!["ACTIVE", "INACTIVE", "RESIGNED"].includes(statusParam)) {
        return fail("INVALID_INPUT", "Status tidak valid.", 400);
      }
      status = statusParam as EmployeeStatus;
    }

    const teamId = sp.get("teamId") ? Number(sp.get("teamId")) : undefined;
    if (teamId !== undefined && !Number.isInteger(teamId)) {
      return fail("INVALID_INPUT", "teamId tidak valid.", 400);
    }
    const positionId = sp.get("positionId") ? Number(sp.get("positionId")) : undefined;
    if (positionId !== undefined && !Number.isInteger(positionId)) {
      return fail("INVALID_INPUT", "positionId tidak valid.", 400);
    }

    const where: Prisma.EmployeeWhereInput = {
      ...(search
        ? {
            OR: [
              { nik: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(teamId !== undefined ? { teamId } : {}),
      ...(positionId !== undefined ? { positionId } : {}),
    };

    const [total, rows] = await Promise.all([
      db.employee.count({ where }),
      db.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
    ]);

    // Shift hari ini per regu (dihitung dari pola rotasi).
    const teamIds = [...new Set(rows.map((r) => r.teamId))];
    const today = todayUTC();
    const schedule = teamIds.length > 0 ? await buildSchedule(today, today) : [];
    const shiftByTeam = new Map<
      number,
      { code: string; name: string; startTime: string | null; endTime: string | null; dayOfWeek: number }
    >();
    for (const s of schedule) {
      if (!teamIds.includes(s.team.id)) continue;
      shiftByTeam.set(s.team.id, {
        code: s.shiftType.code,
        name: s.shiftType.name,
        startTime: s.shiftType.startTime,
        endTime: s.shiftType.endTime,
        dayOfWeek: today.getUTCDay(),
      });
    }

    const items = rows.map((r) => ({
      ...mapEmployee(r),
      shiftToday: shiftByTeam.get(r.teamId) ?? null,
    }));
    return ok(paged(items, total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const createEmployeeSchema = z.object({
  nik: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "NIK harus tepat 8 digit angka."),
  name: z.string().trim().min(1, "Nama wajib diisi."),
  gender: z.enum(["LAKI_LAKI", "PEREMPUAN"]).nullish(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD."),
  positionId: z.number().int(),
  level: z.string().trim().nullish(),
  divisionId: z.number().int(),
  departmentId: z.number().int(),
  sectionId: z.number().int(),
  teamId: z.number().int(),
  supervisorId: z.number().int().nullish(),
  email: z.string().trim().email("Format email tidak valid.").nullish(),
  phone: z.string().trim().nullish(),
  status: z.enum(["ACTIVE", "INACTIVE", "RESIGNED"]).optional(),
  offLocked: z.boolean().optional(),
  offDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
});

/** POST /api/employees — tambah karyawan (ADMIN) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const body = createEmployeeSchema.parse(await req.json());

    let effectiveDate: Date;
    try {
      effectiveDate = parseISODate(body.effectiveDate);
    } catch (e) {
      return fail("INVALID_INPUT", e instanceof Error ? e.message : "Tanggal efektif tidak valid.", 400);
    }

    // Validasi FK
    const [position, division, department, section, team] = await Promise.all([
      db.position.findUnique({ where: { id: body.positionId } }),
      db.division.findUnique({ where: { id: body.divisionId } }),
      db.department.findUnique({ where: { id: body.departmentId } }),
      db.section.findUnique({ where: { id: body.sectionId } }),
      db.team.findUnique({ where: { id: body.teamId } }),
    ]);
    if (!position) return fail("INVALID_INPUT", "Jabatan tidak ditemukan.", 400);
    if (!division) return fail("INVALID_INPUT", "Divisi tidak ditemukan.", 400);
    if (!department) return fail("INVALID_INPUT", "Departemen tidak ditemukan.", 400);
    if (!section) return fail("INVALID_INPUT", "Seksi tidak ditemukan.", 400);
    if (!team) return fail("INVALID_INPUT", "Regu tidak ditemukan.", 400);
    if (body.supervisorId) {
      const supervisor = await db.employee.findUnique({ where: { id: body.supervisorId } });
      if (!supervisor) return fail("INVALID_INPUT", "Atasan tidak ditemukan.", 400);
    }

    const created = await db.employee.create({
      data: {
        nik: body.nik,
        name: body.name,
        gender: body.gender ?? null,
        effectiveDate,
        positionId: body.positionId,
        level: body.level ?? null,
        divisionId: body.divisionId,
        departmentId: body.departmentId,
        sectionId: body.sectionId,
        teamId: body.teamId,
        supervisorId: body.supervisorId ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        status: body.status ?? undefined,
      },
      include: employeeInclude,
    });

    await auditLog({
      userId: user.id,
      action: "CREATE_EMPLOYEE",
      entityType: "Employee",
      entityId: created.id,
      newValue: mapEmployee(created),
      ...getRequestMeta(req),
    });
    return ok(mapEmployee(created), 201);
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
