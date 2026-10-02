import { promises as fs } from "fs";
import path from "path";
import db from "@/lib/db";
import { ok, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { getNumberSetting } from "@/lib/settings";
import { canViewRequest } from "@/lib/leave/workflow";

const ALLOWED_MIME = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  }
  return id;
}

async function loadRequestForAttachment(requestId: number) {
  const item = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: { select: { teamId: true, sectionId: true, departmentId: true } } },
  });
  if (!item) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  return item;
}

// ---------------- GET: daftar lampiran ----------------

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = parseId(id);

    const item = await loadRequestForAttachment(requestId);
    if (!canViewRequest(user, item)) {
      throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses ke pengajuan ini.", 403);
    }

    const attachments = await db.leaveAttachment.findMany({
      where: { requestId },
      orderBy: { uploadedAt: "asc" },
    });
    return ok({ attachments });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// ---------------- POST: unggah lampiran (DRAFT milik sendiri) ----------------

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const requestId = parseId(id);

    const item = await db.leaveRequest.findUnique({ where: { id: requestId } });
    if (!item) throw new ApiError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (user.employeeId == null || user.employeeId !== item.employeeId) {
      throw new ApiError("FORBIDDEN", "Hanya pemilik pengajuan yang dapat mengunggah lampiran.", 403);
    }
    if (item.status !== "DRAFT") {
      throw new ApiError(
        "INVALID_STATUS",
        "Lampiran hanya dapat diunggah saat pengajuan berstatus Draft.",
        400,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError("FILE_REQUIRED", 'File tidak ditemukan (field "file").', 422);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("FILE_REQUIRED", 'File tidak ditemukan (field "file").', 422);
    }

    if (!ALLOWED_MIME.has(file.type)) {
      throw new ApiError("INVALID_FILE_TYPE", "Tipe file harus PDF, JPG, atau PNG.", 422);
    }
    const maxMB = await getNumberSetting("MAX_UPLOAD_MB", 5);
    if (file.size > maxMB * 1024 * 1024) {
      throw new ApiError("FILE_TOO_LARGE", `Ukuran file maksimal ${maxMB} MB.`, 422);
    }
    if (file.size === 0) {
      throw new ApiError("FILE_REQUIRED", "File kosong.", 422);
    }

    const safe = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const stored = `${Date.now()}-${safe}`;
    const dir = path.join(process.cwd(), "storage", "attachments", String(requestId));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()));

    const attachment = await db.leaveAttachment.create({
      data: {
        requestId,
        filePath: `storage/attachments/${requestId}/${stored}`,
        originalName: file.name || safe,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    await auditLog({
      userId: user.id,
      action: "UPLOAD_ATTACHMENT",
      entityType: "LeaveAttachment",
      entityId: attachment.id,
      newValue: { requestId, originalName: attachment.originalName, sizeBytes: file.size },
      ...getRequestMeta(req),
    });

    return ok({ attachment }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
