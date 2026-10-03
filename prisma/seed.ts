/**
 * Seed awal QM Cuti Web App.
 * Jalankan: npx prisma db seed
 * (Node 24 menjalankan TypeScript langsung via type-stripping.)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SETTINGS: [string, string, string][] = [
  ["CFV_DAYS", "12", "Hak CFV (hari)"],
  ["CFV_ELIGIBILITY_MONTHS", "5", "Masa kerja agar CFV aktif (bulan)"],
  ["CT_ANNUAL_DAYS", "12", "Hak CT per tahun (hari)"],
  ["CT_MAX_SINGLE", "6", "Maks CT tunggal (hari)"],
  ["CT_MAX_WITH_CFV", "4", "Maks CT gabung CFV (hari)"],
  ["CT_MIN_GAP_DAYS", "7", "Jarak minimal antar pengajuan CT (hari)"],
  ["POST_CFV_CT_GAP_DAYS", "30", "Jarak CT setelah paket CFV(12)+CT(4) (hari)"],
  ["MIN_NOTICE_DAYS", "10", "Minimum notice pengajuan (hari)"],
  ["TEAM_OFF_LIMIT_SMALL", "1", "Maks OFF/hari bila regu < 7 orang"],
  ["TEAM_OFF_LIMIT_LARGE", "2", "Maks OFF/hari bila regu >= 7 orang"],
  ["TEAM_LARGE_THRESHOLD", "7", "Batas regu besar (orang)"],
  ["TEAM_LEAVE_MAX_PER_DAY", "2", "Maks cuti anggota regu per hari"],
  ["TEAM_LEAVE_CONFLICT_SEVERITY", "WARN", "WARN atau ERROR untuk konflik regu"],
  ["JABATAN_CONFLICT_SEVERITY", "WARN", "WARN atau ERROR untuk konflik jabatan"],
  ["COUNT_WEEKEND_AS_LEAVE", "true", "Hitung Sabtu/Minggu sebagai hari cuti"],
  ["SHIFT_ROTATION_MODE", "WEEKLY", "Mode rotasi shift (WEEKLY/FIXED)"],
  ["SHIFT_ROTATION_ORDER", "PAGI,SORE,MALAM", "Urutan rotasi shift"],
  ["SHIFT_WEEK_START", "KAMIS", "Hari awal minggu rotasi shift"],
  ["SHIFT_ANCHOR_DATE", "2026-10-01", "Awal minggu acuan rotasi shift"],
  ["SHIFT_ANCHOR_MAP", '{"REGU_C":"PAGI","REGU_A":"SORE","REGU_B":"MALAM"}', "Regu -> shift pada minggu acuan"],
];

const PERMISSIONS: [string, string][] = [
  ["employee:read", "Lihat data karyawan"],
  ["employee:write", "Kelola data karyawan"],
  ["org:read", "Lihat struktur organisasi"],
  ["org:write", "Kelola struktur organisasi"],
  ["leave-type:write", "Kelola jenis cuti/izin"],
  ["leave:request", "Mengajukan cuti/izin"],
  ["leave:approve", "Approval pengajuan"],
  ["leave:read:team", "Lihat pengajuan satu regu/area"],
  ["balance:write", "Koreksi saldo cuti"],
  ["shift:read", "Lihat jadwal shift"],
  ["shift:write", "Kelola jadwal shift & OFF"],
  ["holiday:write", "Kelola hari libur"],
  ["report:read", "Lihat & export laporan"],
  ["notification:read", "Lihat log notifikasi"],
  ["audit:read", "Lihat audit log"],
  ["settings:write", "Ubah system settings"],
  ["user:write", "Kelola akun pengguna"],
  ["workflow:write", "Kelola approval workflow"],
];

const ROLE_PERMS: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p[0]),
  SPV: ["employee:read", "org:read", "leave:request", "leave:approve", "leave:read:team", "shift:read", "report:read", "notification:read"],
  FOREMAN: ["employee:read", "org:read", "leave:request", "leave:approve", "leave:read:team", "shift:read", "shift:write"],
  WAFOR: ["employee:read", "org:read", "leave:request", "leave:approve", "leave:read:team", "shift:read", "shift:write"],
  KOORDINATOR: ["employee:read", "org:read", "leave:request", "leave:approve", "leave:read:team", "shift:read"],
  EMPLOYEE: ["leave:request", "shift:read"],
};

async function main(): Promise<void> {
  // ---- Roles & permissions ----
  for (const [code, desc] of PERMISSIONS) {
    await db.permission.upsert({ where: { code }, create: { code, description: desc }, update: { description: desc } });
  }
  const permRows = await db.permission.findMany();
  const permId = new Map(permRows.map((p) => [p.code, p.id]));
  for (const roleName of ["ADMIN", "SPV", "FOREMAN", "WAFOR", "KOORDINATOR", "EMPLOYEE"] as const) {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: roleName },
      update: {},
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    const codes = ROLE_PERMS[roleName] ?? [];
    if (codes.length > 0) {
      await db.rolePermission.createMany({
        data: codes.map((c) => ({ roleId: role.id, permissionId: permId.get(c) as number })),
      });
    }
  }

  // ---- Settings ----
  for (const [key, value, desc] of SETTINGS) {
    await db.systemSetting.upsert({ where: { key }, create: { key, value, description: desc }, update: { value } });
  }

  // ---- Organisasi: Perusahaan -> Departemen -> Divisi -> Seksi -> Regu ----
  const company = await db.company.upsert({
    where: { code: "QM_YWI" },
    create: { code: "QM_YWI", name: "QM YWI" },
    update: { name: "QM YWI" },
  });
  const dept = await db.department.upsert({
    where: { code: "YWI" },
    create: { code: "YWI", name: "YWI", companyId: company.id },
    update: { companyId: company.id },
  });
  const division = await db.division.upsert({
    where: { code: "QM" },
    create: { code: "QM", name: "Quality Management", departmentId: dept.id },
    update: { departmentId: dept.id },
  });
  const secLap = await db.section.upsert({
    where: { code: "INSPEKSI_LAPANGAN" },
    create: { code: "INSPEKSI_LAPANGAN", name: "Inspeksi Lapangan", divisionId: division.id },
    update: { divisionId: division.id },
  });
  const secLab = await db.section.upsert({
    where: { code: "LABORATORIUM" },
    create: { code: "LABORATORIUM", name: "Laboratorium", divisionId: division.id },
    update: { divisionId: division.id },
  });
  const teams: Record<string, number> = {};
  for (const [code, name, secId] of [
    ["REGU_A", "Regu A", secLap.id],
    ["REGU_B", "Regu B", secLap.id],
    ["REGU_C", "Regu C", secLap.id],
    ["LABORATORIUM", "Laboratorium", secLab.id],
  ] as const) {
    const t = await db.team.upsert({
      where: { code },
      create: { code, name, sectionId: secId },
      update: {},
    });
    teams[code] = t.id;
  }

  // ---- Jabatan ----
  const positions: Record<string, number> = {};
  const posDefs: [string, string, number, boolean][] = [
    ["SPV", "Supervisor", 60, false],
    ["WAKIL_SPV", "Wakil Supervisor", 55, false],
    ["FOREMAN", "Foreman", 40, true],
    ["WAFOR", "Wakil Foreman", 35, true],
    ["KOORDINATOR", "Koordinator", 30, true],
    ["CREW", "Crew", 10, false],
  ];
  for (const [code, name, order, ops] of posDefs) {
    const p = await db.position.upsert({
      where: { code },
      create: { code, name, levelOrder: order, isOperationalGroup: ops },
      update: { name, levelOrder: order, isOperationalGroup: ops },
    });
    positions[code] = p.id;
  }

  // ---- Jenis cuti/izin ----
  const leaveTypes: [string, string, "CFV" | "CT" | "SPECIAL_LEAVE" | "PERMISSION", number | null, number | null, number | null, number | null, boolean, boolean][] = [
    ["CFV", "Cuti Family Visit", "CFV", 12, 5, null, null, false, true],
    ["CT", "Cuti Tahunan", "CT", 12, 12, 6, 4, false, true],
    ["CUTI_MENIKAH", "Cuti Menikahan", "SPECIAL_LEAVE", 3, 0, 3, null, true, true],
    ["CUTI_KELAHIRAN", "Cuti Kelahiran Anak", "SPECIAL_LEAVE", 2, 0, 2, null, true, true],
    ["CUTI_KEMATIAN", "Cuti Kematian Keluarga", "SPECIAL_LEAVE", 2, 0, 2, null, true, true],
    ["IZIN_PRIBADI", "Izin Pribadi", "PERMISSION", null, 0, 3, null, false, false],
    ["IZIN_TERLAMBAT", "Izin Terlambat", "PERMISSION", null, 0, 1, null, false, false],
    ["IZIN_KELUAR_AREA", "Izin Keluar Area", "PERMISSION", null, 0, 1, null, false, false],
  ];
  for (const [code, name, cat, defDays, elig, maxSingle, maxCfv, reqAttach, consumes] of leaveTypes) {
    await db.leaveType.upsert({
      where: { code },
      create: {
        code, name, category: cat, defaultDays: defDays, eligibilityMonths: elig,
        maxSingleDays: maxSingle, maxCombinedWithCfv: maxCfv,
        requiresAttachment: reqAttach, consumesBalance: consumes,
      },
      update: {
        name, category: cat, defaultDays: defDays, eligibilityMonths: elig,
        maxSingleDays: maxSingle, maxCombinedWithCfv: maxCfv,
        requiresAttachment: reqAttach, consumesBalance: consumes, isActive: true,
      },
    });
  }

  // ---- Shift (PRD §21). dayOfWeek: 0=Min..6=Sab ----
  const shiftDefs: [string, string][] = [["PAGI", "Shift Pagi"], ["SORE", "Shift Sore"], ["MALAM", "Shift Malam"]];
  const shiftIds: Record<string, number> = {};
  for (const [code, name] of shiftDefs) {
    const s = await db.shiftType.upsert({ where: { code }, create: { code, name }, update: { name } });
    shiftIds[code] = s.id;
  }
  const patterns: [string, number, string, string][] = [
    // [shift, dayOfWeek, mulai, selesai]  (0=Min .. 6=Sab)
    ["PAGI", 4, "07:00", "15:00"], ["PAGI", 5, "07:00", "15:00"], ["PAGI", 6, "07:00", "15:00"],
    ["PAGI", 0, "07:00", "15:00"], ["PAGI", 1, "07:00", "15:00"], ["PAGI", 2, "07:00", "15:00"],
    ["PAGI", 3, "07:00", "19:00"], // Rabu: peralihan Pagi -> Sore (shift panjang)
    ["SORE", 4, "15:00", "23:00"], ["SORE", 5, "15:00", "23:00"], ["SORE", 6, "15:00", "23:00"],
    ["SORE", 0, "15:00", "23:00"], ["SORE", 1, "15:00", "23:00"], ["SORE", 2, "15:00", "23:00"],
    ["SORE", 3, "19:00", "07:00"], // Rabu: peralihan Sore -> Malam (shift panjang)
    ["MALAM", 4, "23:00", "07:00"], ["MALAM", 5, "23:00", "07:00"], ["MALAM", 6, "23:00", "07:00"],
    ["MALAM", 0, "23:00", "07:00"], ["MALAM", 1, "23:00", "07:00"], ["MALAM", 2, "23:00", "07:00"],
    // Rabu: regu Malam OFF serentak (tidak ada pola)
  ];
  // Bersihkan pola lama agar entri yang dihapus tidak tertinggal.
  await db.shiftPattern.deleteMany({ where: { shiftTypeId: { in: Object.values(shiftIds) } } });
  for (const [shift, dow, start, end] of patterns) {
    await db.shiftPattern.create({
      data: { shiftTypeId: shiftIds[shift], dayOfWeek: dow, startTime: start, endTime: end },
    });
  }

  // ---- Workflow default: FOREMAN -> SPV ----
  let wf = await db.approvalWorkflow.findFirst({ where: { isDefault: true } });
  if (!wf) {
    wf = await db.approvalWorkflow.create({ data: { name: "Default (Foreman → SPV)", isDefault: true } });
  }
  await db.approvalWorkflowStep.deleteMany({ where: { workflowId: wf.id } });
  await db.approvalWorkflowStep.createMany({
    data: [
      { workflowId: wf.id, stepOrder: 1, role: "FOREMAN" },
      { workflowId: wf.id, stepOrder: 2, role: "SPV" },
    ],
  });

  // ---- Akun demo ----
  const mkUser = async (
    username: string, password: string, role: "ADMIN" | "SPV" | "FOREMAN" | "WAFOR" | "KOORDINATOR" | "EMPLOYEE",
    emp?: { nik: string; name: string; position: string; team: string; effectiveDate: string; supervisorNik?: string },
  ): Promise<void> => {
    const roleRow = await db.role.findUniqueOrThrow({ where: { name: role } });
    let employeeId: number | null = null;
    if (emp) {
      let supervisorId: number | null = null;
      if (emp.supervisorNik) {
        const sup = await db.employee.findUnique({ where: { nik: emp.supervisorNik } });
        supervisorId = sup?.id ?? null;
      }
      const e = await db.employee.upsert({
        where: { nik: emp.nik },
        create: {
          nik: emp.nik, name: emp.name,
          effectiveDate: new Date(emp.effectiveDate + "T00:00:00Z"),
          positionId: positions[emp.position], level: emp.position,
          divisionId: division.id, departmentId: dept.id,
          sectionId: emp.team === "LABORATORIUM" ? secLab.id : secLap.id,
          teamId: teams[emp.team], supervisorId,
          status: "ACTIVE",
        },
        update: {},
      });
      employeeId = e.id;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await db.user.upsert({
      where: { username },
      create: { username, passwordHash, employeeId, isActive: true },
      update: { passwordHash, employeeId, isActive: true },
    });
    await db.userRole.deleteMany({ where: { userId: u.id } });
    await db.userRole.create({ data: { userId: u.id, roleId: roleRow.id } });
  };

  await mkUser("admin", process.env.ADMIN_PASSWORD || "admin123", "ADMIN");
  await mkUser("spv1", "cuti123", "SPV", { nik: "900001", name: "Supervisor Satu", position: "SPV", team: "REGU_A", effectiveDate: "2020-01-15" });
  await mkUser("foreman1", "cuti123", "FOREMAN", { nik: "900002", name: "Foreman Satu", position: "FOREMAN", team: "REGU_A", effectiveDate: "2021-03-01", supervisorNik: "900001" });
  await mkUser("wafor1", "cuti123", "WAFOR", { nik: "900003", name: "Wakil Foreman Satu", position: "WAFOR", team: "REGU_A", effectiveDate: "2021-06-01", supervisorNik: "900002" });
  await mkUser("koord1", "cuti123", "KOORDINATOR", { nik: "900004", name: "Koordinator Satu", position: "KOORDINATOR", team: "REGU_A", effectiveDate: "2022-01-10", supervisorNik: "900002" });
  await mkUser("crew1", "cuti123", "EMPLOYEE", { nik: "900005", name: "Crew Satu", position: "CREW", team: "REGU_A", effectiveDate: "2023-02-01", supervisorNik: "900002" });
  await mkUser("crew2", "cuti123", "EMPLOYEE", { nik: "900006", name: "Crew Dua", position: "CREW", team: "REGU_A", effectiveDate: "2024-08-01", supervisorNik: "900002" });
  await mkUser("crew3", "cuti123", "EMPLOYEE", { nik: "900007", name: "Crew Tiga", position: "CREW", team: "REGU_B", effectiveDate: "2025-06-01", supervisorNik: "900002" });

  console.log("Seed selesai: roles, settings, org, jabatan, jenis cuti, shift, workflow, akun demo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
