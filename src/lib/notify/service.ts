/**
 * NotificationService — enqueue sisi database.
 * PRINSIP (PRD §30, §56): Web App + PostgreSQL adalah source of truth.
 * Fungsi ini TIDAK PERNAH melempar error dan TIDAK PERNAH menggagalkan
 * transaksi cuti — notifikasi hanya ditulis sebagai baris PENDING untuk
 * diproses worker terpisah.
 */
import db from "../db";
import { formatRangeID } from "../dates";
import type { NotificationEvent, WorkflowStepRole } from "@prisma/client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export interface EnqueueOpts {
  event: NotificationEvent;
  /** penerima langsung (karyawan) */
  employeeIds?: number[];
  /** atau: penerima = approver pada step workflow pengajuan ini */
  requestId?: number;
  stepRole?: WorkflowStepRole | null;
  title: string;
  message: string;
  actionUrl?: string;
}

async function createNotifications(opts: EnqueueOpts): Promise<void> {
  let employeeIds = opts.employeeIds ?? [];
  if (opts.requestId && opts.stepRole) {
    employeeIds = [...employeeIds, ...(await resolveApproverEmployeeIds(opts.requestId, opts.stepRole))];
  }
  employeeIds = [...new Set(employeeIds)];
  if (employeeIds.length === 0) return;
  await db.notification.createMany({
    data: employeeIds.map((employeeId) => ({
      eventType: opts.event,
      employeeId,
      channel: "TELEGRAM" as const,
      title: opts.title,
      message: opts.message,
      actionUrl: opts.actionUrl,
    })),
  });
}

/** Jangan pernah throw — kegagalan notifikasi tidak boleh menggagalkan transaksi. */
export async function enqueue(opts: EnqueueOpts): Promise<void> {
  try {
    await createNotifications(opts);
  } catch (e) {
    console.error("[notify] enqueue gagal:", e);
  }
}

/** Cari karyawan approver untuk step tertentu berdasarkan scope organisasi. */
export async function resolveApproverEmployeeIds(
  requestId: number,
  stepRole: WorkflowStepRole,
): Promise<number[]> {
  const req = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  });
  if (!req) return [];
  const emp = req.employee;

  let where: Record<string, unknown> = { status: "ACTIVE" };
  if (stepRole === "FOREMAN" || stepRole === "WAFOR") {
    // Foreman/Wafor dapat saling menggantikan (PRD §24)
    where = { ...where, teamId: emp.teamId, position: { code: { in: ["FOREMAN", "WAFOR"] } } };
  } else if (stepRole === "KOORDINATOR") {
    where = { ...where, sectionId: emp.sectionId, position: { code: "KOORDINATOR" } };
  } else if (stepRole === "SPV") {
    where = { ...where, departmentId: emp.departmentId, position: { code: { in: ["SPV", "WAKIL_SPV"] } } };
  }
  const approvers = await db.employee.findMany({ where: where as never, select: { id: true } });
  return approvers.map((a) => a.id);
}

/** Bangun pesan standar PRD §31–§35 untuk event pengajuan cuti. */
export async function enqueueLeaveEvent(
  event: NotificationEvent,
  requestId: number,
  extra?: { comment?: string; stepRole?: WorkflowStepRole | null; nextStepRole?: WorkflowStepRole | null },
): Promise<void> {
  try {
    const req = await db.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: { include: { position: true, team: true } },
        leaveType: true,
      },
    });
    if (!req) return;
    const periode = formatRangeID(req.startDate, req.endDate);
    const durasi = `${Number(req.totalDays)} hari`;
    const head = [
      `Nama    : ${req.employee.name}`,
      `NIK     : ${req.employee.nik}`,
      `Jabatan : ${req.employee.position.name}`,
      `Regu    : ${req.employee.team.name}`,
      ``,
      `Jenis   : ${req.leaveType.name}`,
      `Periode : ${periode}`,
      `Durasi  : ${durasi}`,
    ].join("\n");

    switch (event) {
      case "LEAVE_SUBMITTED":
      case "APPROVAL_REQUIRED": {
        const stepLabel =
          extra?.stepRole === "SPV" ? "SPV" : extra?.stepRole === "KOORDINATOR" ? "Koordinator" : "Foreman/Wafor";
        await createNotifications({
          event,
          requestId,
          stepRole: extra?.stepRole ?? null,
          title: "Pengajuan cuti baru",
          message: `🔔 PENGAJUAN CUTI BARU\n\n${head}\n\nStatus:\nMenunggu approval ${stepLabel}`,
          actionUrl: `${APP_URL}/approval`,
        });
        break;
      }
      case "LEAVE_APPROVED": {
        await createNotifications({
          event,
          employeeIds: [req.employeeId],
          title: "Pengajuan disetujui",
          message: `✅ APPROVAL CUTI\n\n${head}\n\nStatus:\n${extra?.nextStepRole ? "Menunggu approval tahap berikutnya" : "DISETUJUI FINAL"}`,
          actionUrl: `${APP_URL}/pengajuan/${requestId}`,
        });
        if (extra?.nextStepRole) {
          const stepLabel =
            extra.nextStepRole === "SPV" ? "SPV" : extra.nextStepRole === "KOORDINATOR" ? "Koordinator" : "Foreman/Wafor";
          await createNotifications({
            event: "APPROVAL_REQUIRED",
            requestId,
            stepRole: extra.nextStepRole,
            title: "Perlu approval",
            message: `🔔 PENGAJUAN CUTI BARU\n\n${head}\n\nStatus:\nMenunggu approval ${stepLabel}`,
            actionUrl: `${APP_URL}/approval`,
          });
        }
        break;
      }
      case "LEAVE_REJECTED": {
        await createNotifications({
          event,
          employeeIds: [req.employeeId],
          title: "Pengajuan ditolak",
          message: `❌ PENGAJUAN DITOLAK\n\n${head}\n\nAlasan:\n${extra?.comment ?? "-"}\n\nSilakan buka Web App untuk informasi lengkap.`,
          actionUrl: `${APP_URL}/pengajuan/${requestId}`,
        });
        break;
      }
      case "LEAVE_CANCEL_REQUESTED": {
        await createNotifications({
          event,
          requestId,
          stepRole: extra?.stepRole ?? "FOREMAN",
          title: "Pembatalan cuti diajukan",
          message: `🔄 PEMBATALAN CUTI\n\n${head}\nStatus: Cancellation Requested\n\nMohon dilakukan pemeriksaan.`,
          actionUrl: `${APP_URL}/approval`,
        });
        break;
      }
      case "LEAVE_CANCELLED": {
        await createNotifications({
          event,
          employeeIds: [req.employeeId],
          title: "Pembatalan disetujui",
          message: `🔄 PEMBATALAN CUTI\n\n${head}\n\nStatus: Dibatalkan. Saldo telah dikembalikan.`,
          actionUrl: `${APP_URL}/pengajuan/${requestId}`,
        });
        break;
      }
      case "LEAVE_CONFLICT": {
        await createNotifications({
          event,
          requestId,
          stepRole: "FOREMAN",
          title: "Konflik jadwal terdeteksi",
          message: `⚠️ KONFLIK JADWAL\n\n${head}\n\nMohon dilakukan pemeriksaan.`,
          actionUrl: `${APP_URL}/approval`,
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[notify] enqueueLeaveEvent gagal:", e);
  }
}
