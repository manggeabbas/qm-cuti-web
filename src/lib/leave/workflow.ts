/**
 * Mesin workflow approval pengajuan cuti (PRD §24–§29).
 *
 * - resolveWorkflow: workflow per regu (team) -> fallback workflow default.
 * - submitRequest / approveRequest / rejectRequest / returnRequest /
 *   requestCancel / confirmCancel: transisi status + pencatatan approval
 *   + pemakaian/pengembalian saldo, SELALU di dalam transaksi DB.
 * - canApproveStep / canViewRequest: helper otorisasi untuk inbox & detail.
 *
 * Semua aturan bisnis cuti tetap di LeaveValidationService (validation.ts);
 * file ini hanya mengatur alur approval & otorisasi.
 */
import db from "../db";
import { ApiError } from "../api";
import type { SessionUser } from "../auth";
import { hasRole } from "../role-utils";
import { enqueueLeaveEvent } from "../notify/service";
import { ensureAllocation, recordUsage, recordRefund } from "./balance";
import {
  buildValidationInput,
  validateLeaveRequest,
  type ValidationInput,
  type ValidationIssue,
} from "./validation";
import {
  RequestStatus,
  WorkflowStepRole,
  type Prisma,
  type RoleName,
} from "@prisma/client";

// ---------------- Konstanta ----------------

export const PENDING_STATUSES: RequestStatus[] = [
  RequestStatus.SUBMITTED,
  RequestStatus.PENDING_KOORDINATOR,
  RequestStatus.PENDING_WAFOR,
  RequestStatus.PENDING_FOREMAN,
  RequestStatus.PENDING_SPV,
];

const ALL_STATUSES: RequestStatus[] = [
  RequestStatus.DRAFT,
  ...PENDING_STATUSES,
  RequestStatus.APPROVED,
  RequestStatus.REJECTED,
  RequestStatus.CANCEL_REQUESTED,
  RequestStatus.CANCELLED,
  RequestStatus.COMPLETED,
];

export function isKnownStatus(s: string): s is RequestStatus {
  return (ALL_STATUSES as string[]).includes(s);
}

/** stepRole -> status pending yang sesuai */
const STEP_ROLE_TO_STATUS: Record<WorkflowStepRole, RequestStatus> = {
  [WorkflowStepRole.FOREMAN]: RequestStatus.PENDING_FOREMAN,
  [WorkflowStepRole.WAFOR]: RequestStatus.PENDING_WAFOR,
  [WorkflowStepRole.KOORDINATOR]: RequestStatus.PENDING_KOORDINATOR,
  [WorkflowStepRole.WSPV]: RequestStatus.PENDING_SPV, // WSPV & SPV satu jenjang (saling menggantikan)
  [WorkflowStepRole.SPV]: RequestStatus.PENDING_SPV,
};

/** Jenjang tiap stepRole (diselaraskan dengan Position.levelOrder di seed). */
const STEP_ROLE_LEVEL: Record<WorkflowStepRole, number> = {
  [WorkflowStepRole.KOORDINATOR]: 30,
  [WorkflowStepRole.WAFOR]: 35,
  [WorkflowStepRole.FOREMAN]: 40,
  [WorkflowStepRole.WSPV]: 55,
  [WorkflowStepRole.SPV]: 60,
};

/** status pending -> stepRole (fallback bila workflow tidak terlampir) */
const STATUS_TO_STEP_ROLE: Partial<Record<RequestStatus, WorkflowStepRole>> = {
  [RequestStatus.PENDING_FOREMAN]: WorkflowStepRole.FOREMAN,
  [RequestStatus.PENDING_WAFOR]: WorkflowStepRole.WAFOR,
  [RequestStatus.PENDING_KOORDINATOR]: WorkflowStepRole.KOORDINATOR,
  [RequestStatus.PENDING_SPV]: WorkflowStepRole.SPV,
};

const STEP_LABELS: Record<WorkflowStepRole, string> = {
  [WorkflowStepRole.FOREMAN]: "Foreman",
  [WorkflowStepRole.WAFOR]: "Wafor",
  [WorkflowStepRole.KOORDINATOR]: "Koordinator",
  [WorkflowStepRole.WSPV]: "WSPV",
  [WorkflowStepRole.SPV]: "SPV",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.DRAFT]: "Draft",
  [RequestStatus.SUBMITTED]: "Diajukan",
  [RequestStatus.PENDING_KOORDINATOR]: "Menunggu Koordinator",
  [RequestStatus.PENDING_WAFOR]: "Menunggu Wafor",
  [RequestStatus.PENDING_FOREMAN]: "Menunggu Foreman",
  [RequestStatus.PENDING_SPV]: "Menunggu SPV",
  [RequestStatus.APPROVED]: "Disetujui",
  [RequestStatus.REJECTED]: "Ditolak",
  [RequestStatus.CANCEL_REQUESTED]: "Permintaan pembatalan",
  [RequestStatus.CANCELLED]: "Dibatalkan",
  [RequestStatus.COMPLETED]: "Selesai",
};

export function statusLabel(s: RequestStatus): string {
  return STATUS_LABELS[s] ?? s;
}

// ---------------- Tipe ----------------

export type ResolvedWorkflow = Prisma.ApprovalWorkflowGetPayload<{
  include: { steps: true };
}>;

type RequestForDecision = Prisma.LeaveRequestGetPayload<{
  include: {
    employee: true;
    leaveType: true;
    workflow: { include: { steps: true } };
  };
}>;

/** Bentuk minimal request yang dibutuhkan canApproveStep / canViewRequest. */
export interface StepContext {
  employeeId: number;
  status: RequestStatus;
  currentStepOrder: number | null;
  employee: { teamId: number; sectionId: number; departmentId: number; divisionId: number };
  workflow: { steps: Array<{ stepOrder: number; role: WorkflowStepRole }> } | null;
}

// ---------------- Resolve workflow ----------------

/**
 * Cari workflow aktif untuk regu karyawan; fallback ke workflow default global.
 */
export async function resolveWorkflow(employeeId: number): Promise<ResolvedWorkflow> {
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new ApiError("NOT_FOUND", "Karyawan tidak ditemukan.", 404);

  const teamWf = await db.approvalWorkflow.findFirst({
    where: { teamId: emp.teamId, isActive: true },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  const wf =
    teamWf ??
    (await db.approvalWorkflow.findFirst({
      where: { isDefault: true, isActive: true },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    }));

  if (!wf || wf.steps.length === 0) {
    throw new ApiError(
      "WORKFLOW_NOT_FOUND",
      "Workflow approval belum dikonfigurasi. Hubungi administrator.",
      500,
    );
  }
  return wf;
}

// ---------------- Otorisasi ----------------

function stepRoleOf(req: StepContext): WorkflowStepRole | null {
  const step = req.workflow?.steps.find((s) => s.stepOrder === req.currentStepOrder);
  if (step) return step.role;
  return STATUS_TO_STEP_ROLE[req.status] ?? null;
}

/** Role yang boleh memutuskan pada step ini (WAFOR <-> FOREMAN, WSPV <-> SPV saling menggantikan). */
function allowedRoles(stepRole: WorkflowStepRole): RoleName[] {
  if (stepRole === WorkflowStepRole.FOREMAN || stepRole === WorkflowStepRole.WAFOR) {
    return ["FOREMAN", "WAFOR"];
  }
  if (stepRole === WorkflowStepRole.SPV || stepRole === WorkflowStepRole.WSPV) {
    return ["SPV", "WSPV"];
  }
  return [stepRole];
}

/** Apakah approver berada dalam scope organisasi yang sama dengan pemohon. */
function inScope(
  stepRole: WorkflowStepRole,
  approver: NonNullable<SessionUser["employee"]>,
  requester: StepContext["employee"],
): boolean {
  switch (stepRole) {
    case WorkflowStepRole.SPV:
      return approver.departmentId === requester.departmentId;
    case WorkflowStepRole.WSPV:
      return approver.divisionId === requester.divisionId;
    case WorkflowStepRole.KOORDINATOR:
      return approver.sectionId === requester.sectionId;
    case WorkflowStepRole.FOREMAN:
    case WorkflowStepRole.WAFOR:
      return approver.teamId === requester.teamId;
  }
}

function assertMayDecide(
  user: SessionUser,
  req: StepContext,
  stepRole: WorkflowStepRole,
): void {
  // (c) tidak boleh memproses pengajuan milik sendiri
  if (user.employeeId != null && user.employeeId === req.employeeId) {
    throw new ApiError("SELF_APPROVAL", "Anda tidak dapat memproses pengajuan milik sendiri.", 403);
  }
  const isAdmin = hasRole(user, "ADMIN");
  // (a) role sesuai step (WAFOR <-> FOREMAN saling menggantikan; ADMIN bypass)
  const roleOk = isAdmin || allowedRoles(stepRole).some((r) => hasRole(user, r));
  if (!roleOk) {
    throw new ApiError(
      "FORBIDDEN",
      `Pengajuan ini menunggu approval ${STEP_LABELS[stepRole]}.`,
      403,
    );
  }
  // (b) scope organisasi
  if (!isAdmin) {
    const emp = user.employee;
    if (!emp) {
      throw new ApiError("FORBIDDEN", "Akun Anda belum terhubung ke data karyawan.", 403);
    }
    if (!inScope(stepRole, emp, req.employee)) {
      throw new ApiError(
        "FORBIDDEN",
        "Pengajuan ini berada di luar area tanggung jawab Anda.",
        403,
      );
    }
  }
}

/**
 * Boolean helper untuk inbox: apakah user boleh memutuskan request ini sekarang.
 * Tidak pernah melempar error.
 */
export async function canApproveStep(user: SessionUser, req: StepContext): Promise<boolean> {
  try {
    if (!PENDING_STATUSES.includes(req.status)) return false;
    const stepRole = stepRoleOf(req);
    if (!stepRole) return false;
    assertMayDecide(user, req, stepRole);
    return true;
  } catch {
    return false;
  }
}

/** Apakah user boleh MELIHAT request: pemilik / approver area / admin. */
export function canViewRequest(
  user: SessionUser,
  req: { employeeId: number; employee: StepContext["employee"] },
): boolean {
  if (hasRole(user, "ADMIN")) return true;
  if (user.employeeId != null && user.employeeId === req.employeeId) return true;
  const emp = user.employee;
  if (!emp) return false;
  if (hasRole(user, "FOREMAN", "WAFOR") && emp.teamId === req.employee.teamId) return true;
  if (hasRole(user, "KOORDINATOR") && emp.sectionId === req.employee.sectionId) return true;
  if (hasRole(user, "SPV") && emp.departmentId === req.employee.departmentId) return true;
  if (hasRole(user, "WSPV") && emp.divisionId === req.employee.divisionId) return true;
  return false;
}

// ---------------- Util internal ----------------

async function loadForDecision(requestId: number): Promise<RequestForDecision> {
  const req = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
      leaveType: true,
      workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
    },
  });
  if (!req) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  return req;
}

function assertPending(req: { status: RequestStatus }, aksi: string): void {
  if (!PENDING_STATUSES.includes(req.status)) {
    throw new ApiError(
      "INVALID_STATUS",
      `Pengajuan berstatus "${statusLabel(req.status)}" tidak dapat ${aksi}.`,
      400,
    );
  }
}

/** Catat konflik yang terdeteksi saat validasi (untuk laporan konflik PRD §43). */
async function recordDetectedConflicts(
  requestId: number,
  issues: ValidationIssue[],
): Promise<void> {
  const conflicts = issues.filter(
    (i) => i.code === "OVERLAP" || i.code === "TEAM_CONFLICT" || i.code === "POSITION_CONFLICT",
  );
  if (conflicts.length === 0) return;
  try {
    await db.leaveRequestConflict.deleteMany({ where: { requestId } });
    await db.leaveRequestConflict.createMany({
      data: conflicts.map((c) => ({
        requestId,
        conflictType:
          c.code === "OVERLAP" ? "OVERLAP" : c.code === "TEAM_CONFLICT" ? "REGU" : "JABATAN",
        severity: c.severity === "ERROR" ? "BLOCK" : "WARN",
        description: c.message,
      })),
    });
  } catch (e) {
    console.error("[workflow] gagal mencatat konflik:", e);
  }
}

function sortedSteps(req: RequestForDecision): Array<{ stepOrder: number; role: WorkflowStepRole }> {
  return [...(req.workflow?.steps ?? [])].sort((a, b) => a.stepOrder - b.stepOrder);
}

// ---------------- Transisi ----------------

/**
 * Ajukan DRAFT menjadi pengajuan resmi.
 * Validasi penuh via LeaveValidationService; gagal -> ApiError VALIDATION_FAILED.
 */
export async function submitRequest(requestId: number, user: SessionUser) {
  const req = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true },
  });
  if (!req) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);

  const isOwner = user.employeeId != null && user.employeeId === req.employeeId;
  if (!isOwner && !hasRole(user, "ADMIN")) {
    throw new ApiError("FORBIDDEN", "Hanya pemilik pengajuan yang dapat mengajukannya.", 403);
  }
  if (req.status !== RequestStatus.DRAFT) {
    throw new ApiError("INVALID_STATUS", "Hanya pengajuan berstatus Draft yang dapat diajukan.", 400);
  }

  // pastikan alokasi hak sudah ada sebelum validasi saldo
  await ensureAllocation(req.employeeId);

  // descriptor paket CFV+CT (bila request bagian dari paket)
  let pkg: ValidationInput["pkg"] = null;
  if (req.packageId) {
    const sibling = await db.leaveRequest.findFirst({
      where: { packageId: req.packageId, id: { not: req.id } },
      include: { leaveType: { select: { category: true } } },
      orderBy: { packageOrder: "asc" },
    });
    if (sibling) {
      const order: 1 | 2 =
        req.packageOrder === 2 ? 2 : req.packageOrder === 1 ? 1 : req.leaveType.category === "CT" ? 2 : 1;
      pkg = {
        order,
        siblingCategory: sibling.leaveType.category,
        siblingStart: sibling.startDate,
        siblingEnd: sibling.endDate,
      };
    }
  }

  const hasAttachment = (await db.leaveAttachment.count({ where: { requestId } })) > 0;

  let input: ValidationInput;
  try {
    input = await buildValidationInput({
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      startDate: req.startDate,
      endDate: req.endDate,
      excludeRequestId: req.id,
      hasAttachment,
      pkg,
    });
  } catch (e) {
    throw new ApiError(
      "VALIDATION_FAILED",
      e instanceof Error ? e.message : "Validasi pengajuan gagal.",
      422,
    );
  }

  const result = validateLeaveRequest(input);
  if (!result.valid) {
    const msg = result.issues
      .filter((i) => i.severity === "ERROR")
      .map((i) => i.message)
      .join(" ");
    throw new ApiError("VALIDATION_FAILED", msg || "Pengajuan tidak memenuhi aturan cuti.", 422);
  }

  const wf = await resolveWorkflow(req.employeeId);
  // Lewati step yang jenjangnya <= jabatan pemohon (mis. foreman langsung ke SPV).
  // Bila tidak ada step yang lebih tinggi (mis. SPV), mulai dari step tertinggi
  // agar tetap ada yang menyetujui (tidak auto-approve).
  const requester = await db.employee.findUnique({
    where: { id: req.employeeId },
    include: { position: { select: { levelOrder: true } } },
  });
  const requesterLevel = requester?.position.levelOrder ?? 0;
  const first =
    wf.steps.find((s) => (STEP_ROLE_LEVEL[s.role] ?? 0) > requesterLevel) ??
    wf.steps[wf.steps.length - 1];
  const newStatus = STEP_ROLE_TO_STATUS[first.role];

  const updated = await db.$transaction(async (tx) => {
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        workflow: { connect: { id: wf.id } },
        currentStepOrder: first.stepOrder,
        submittedAt: new Date(),
      },
    });
  });

  await recordDetectedConflicts(requestId, result.issues);
  // notifikasi SETELAH transaksi sukses (tidak pernah melempar)
  await enqueueLeaveEvent("LEAVE_SUBMITTED", requestId, { stepRole: first.role });
  return updated;
}

/** Setujui step aktif; step terakhir -> APPROVED + catat pemakaian saldo. */
export async function approveRequest(requestId: number, approver: SessionUser, comment?: string) {
  const req = await loadForDecision(requestId);
  assertPending(req, "disetujui");

  const stepRole = stepRoleOf(req);
  if (!stepRole) {
    throw new ApiError("WORKFLOW_STEP_NOT_FOUND", "Langkah approval aktif tidak ditemukan.", 500);
  }
  assertMayDecide(approver, req, stepRole);

  let steps = sortedSteps(req);
  let workflowId: number | null = req.workflowId;
  if (steps.length === 0) {
    const wf = await resolveWorkflow(req.employeeId);
    steps = [...wf.steps];
    workflowId = wf.id;
  }
  if (workflowId == null) {
    throw new ApiError(
      "WORKFLOW_NOT_FOUND",
      "Workflow approval belum dikonfigurasi. Hubungi administrator.",
      500,
    );
  }
  const current = steps.find((s) => s.stepOrder === req.currentStepOrder)
    ?? steps.find((s) => s.role === stepRole)
    ?? steps[0];
  const next = steps.find((s) => s.stepOrder > current.stepOrder) ?? null;

  const updated = await db.$transaction(async (tx) => {
    await tx.leaveRequestApproval.create({
      data: {
        requestId,
        stepOrder: current.stepOrder,
        stepRole,
        approverId: approver.id,
        action: "APPROVED",
        comment: comment?.trim() ? comment.trim() : null,
      },
    });
    if (next) {
      return tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: STEP_ROLE_TO_STATUS[next.role],
          currentStepOrder: next.stepOrder,
          workflow: { connect: { id: workflowId } },
        },
      });
    }
    // step terakhir: final APPROVED + potong saldo dalam transaksi yang sama
    const done = await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.APPROVED,
        decidedAt: new Date(),
        workflow: { connect: { id: workflowId } },
      },
    });
    await recordUsage(requestId, tx);
    return done;
  });

  await enqueueLeaveEvent("LEAVE_APPROVED", requestId, { nextStepRole: next?.role ?? null });
  return updated;
}

/** Tolak pengajuan — comment WAJIB (AC-009). */
export async function rejectRequest(requestId: number, approver: SessionUser, comment?: string) {
  if (!comment?.trim()) {
    throw new ApiError("COMMENT_REQUIRED", "Alasan penolakan wajib diisi.", 422);
  }
  const req = await loadForDecision(requestId);
  assertPending(req, "ditolak");

  const stepRole = stepRoleOf(req);
  if (!stepRole) {
    throw new ApiError("WORKFLOW_STEP_NOT_FOUND", "Langkah approval aktif tidak ditemukan.", 500);
  }
  assertMayDecide(approver, req, stepRole);

  const steps = sortedSteps(req);
  const currentOrder =
    steps.find((s) => s.stepOrder === req.currentStepOrder)?.stepOrder
    ?? steps.find((s) => s.role === stepRole)?.stepOrder
    ?? 0;

  const updated = await db.$transaction(async (tx) => {
    await tx.leaveRequestApproval.create({
      data: {
        requestId,
        stepOrder: currentOrder,
        stepRole,
        approverId: approver.id,
        action: "REJECTED",
        comment: comment.trim(),
      },
    });
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.REJECTED, decidedAt: new Date() },
    });
  });

  await enqueueLeaveEvent("LEAVE_REJECTED", requestId, { comment: comment.trim() });
  return updated;
}

/** Kembalikan ke DRAFT untuk direvisi pemohon. */
export async function returnRequest(requestId: number, approver: SessionUser, comment?: string) {
  const req = await loadForDecision(requestId);
  assertPending(req, "dikembalikan");

  const stepRole = stepRoleOf(req);
  if (!stepRole) {
    throw new ApiError("WORKFLOW_STEP_NOT_FOUND", "Langkah approval aktif tidak ditemukan.", 500);
  }
  assertMayDecide(approver, req, stepRole);

  const steps = sortedSteps(req);
  const currentOrder =
    steps.find((s) => s.stepOrder === req.currentStepOrder)?.stepOrder
    ?? steps.find((s) => s.role === stepRole)?.stepOrder
    ?? 0;

  return db.$transaction(async (tx) => {
    await tx.leaveRequestApproval.create({
      data: {
        requestId,
        stepOrder: currentOrder,
        stepRole,
        approverId: approver.id,
        action: "RETURNED",
        comment: comment?.trim() ? comment.trim() : null,
      },
    });
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.DRAFT, currentStepOrder: null, submittedAt: null },
    });
  });
}

/**
 * Keputusan paket: pengajuan yang terikat packageId diputuskan sebagai satu
 * kesatuan (all-or-nothing) — tidak bisa sebagian disetujui sebagian ditolak.
 */

/** Ambil semua id request dalam satu paket (urut packageOrder); [requestId] bila bukan paket. */
export async function packageRequestIds(requestId: number): Promise<number[]> {
  const req = await db.leaveRequest.findUnique({
    where: { id: requestId },
    select: { packageId: true },
  });
  if (!req) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  if (!req.packageId) return [requestId];
  const sibs = await db.leaveRequest.findMany({
    where: { packageId: req.packageId },
    select: { id: true },
    orderBy: [{ packageOrder: "asc" }, { id: "asc" }],
  });
  return sibs.map((s) => s.id);
}

/** Pastikan approver boleh memutuskan SEMUA bagian paket sebelum ada yang dieksekusi. */
async function assertMayDecidePackage(ids: number[], approver: SessionUser, aksi: string) {
  for (const id of ids) {
    const req = await loadForDecision(id);
    assertPending(req, aksi);
    const stepRole = stepRoleOf(req);
    if (!stepRole) {
      throw new ApiError("WORKFLOW_STEP_NOT_FOUND", "Langkah approval aktif tidak ditemukan.", 500);
    }
    assertMayDecide(approver, req, stepRole);
  }
}

/** Setujui seluruh paket sekaligus. */
export async function approvePackage(requestId: number, approver: SessionUser, comment?: string) {
  const ids = await packageRequestIds(requestId);
  await assertMayDecidePackage(ids, approver, "disetujui");
  const out = [];
  for (const id of ids) out.push(await approveRequest(id, approver, comment));
  return out;
}

/** Tolak seluruh paket sekaligus — comment WAJIB. */
export async function rejectPackage(requestId: number, approver: SessionUser, comment?: string) {
  const ids = await packageRequestIds(requestId);
  await assertMayDecidePackage(ids, approver, "ditolak");
  const out = [];
  for (const id of ids) out.push(await rejectRequest(id, approver, comment));
  return out;
}

/** Kembalikan seluruh paket ke DRAFT untuk direvisi pemohon. */
export async function returnPackage(requestId: number, approver: SessionUser, comment?: string) {
  const ids = await packageRequestIds(requestId);
  await assertMayDecidePackage(ids, approver, "dikembalikan");
  const out = [];
  for (const id of ids) out.push(await returnRequest(id, approver, comment));
  return out;
}

/**
 * Pemohon (atau ADMIN) meminta pembatalan pengajuan yang sedang berjalan /
 * sudah disetujui. Status -> CANCEL_REQUESTED.
 */
export async function requestCancel(requestId: number, user: SessionUser) {
  const req = await db.leaveRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);

  const isOwner = user.employeeId != null && user.employeeId === req.employeeId;
  if (!isOwner && !hasRole(user, "ADMIN")) {
    throw new ApiError("FORBIDDEN", "Hanya pemilik pengajuan yang dapat meminta pembatalan.", 403);
  }

  const cancellable: RequestStatus[] = [...PENDING_STATUSES, RequestStatus.APPROVED];
  if (!cancellable.includes(req.status)) {
    throw new ApiError(
      "INVALID_STATUS",
      `Pengajuan berstatus "${statusLabel(req.status)}" tidak dapat dibatalkan.`,
      400,
    );
  }

  const updated = await db.leaveRequest.update({
    where: { id: requestId },
    data: { status: RequestStatus.CANCEL_REQUESTED },
  });

  await enqueueLeaveEvent("LEAVE_CANCEL_REQUESTED", requestId, {
    stepRole: WorkflowStepRole.FOREMAN,
  });
  return updated;
}

/**
 * Approver mengonfirmasi pembatalan. Status -> CANCELLED; bila sebelumnya
 * sudah APPROVED (ada pemakaian saldo), saldo dikembalikan dalam transaksi.
 */
export async function confirmCancel(requestId: number, approver: SessionUser) {
  const req = await loadForDecision(requestId);
  if (req.status !== RequestStatus.CANCEL_REQUESTED) {
    throw new ApiError(
      "INVALID_STATUS",
      "Pengajuan tidak dalam status permintaan pembatalan.",
      400,
    );
  }

  let steps = sortedSteps(req);
  if (steps.length === 0) {
    const wf = await resolveWorkflow(req.employeeId);
    steps = [...wf.steps];
  }
  const first = steps[0];
  // kewenangan sama seperti approval: role + scope + bukan milik sendiri
  assertMayDecide(approver, req, first.role);

  const updated = await db.$transaction(async (tx) => {
    await tx.leaveRequestApproval.create({
      data: {
        requestId,
        stepOrder: first.stepOrder,
        stepRole: first.role,
        approverId: approver.id,
        action: "APPROVED",
        comment: "Pembatalan disetujui",
      },
    });
    // kembalikan saldo hanya bila pemakaian sudah tercatat (pernah APPROVED final)
    const usage = await tx.leaveBalanceTransaction.findFirst({
      where: { requestId, kind: "USAGE" },
    });
    if (usage) {
      await recordRefund(requestId, tx);
    }
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.CANCELLED, decidedAt: new Date() },
    });
  });

  await enqueueLeaveEvent("LEAVE_CANCELLED", requestId);
  return updated;
}
