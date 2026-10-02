import { promises as fs } from "fs";
import path from "path";
import db from "@/lib/db";
import { toErrorResponse, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canViewRequest } from "@/lib/leave/workflow";

export async function GET(_req: Request, ctx: { params: Promise<{ attId: string }> }) {
  try {
    const user = await requireUser();
    const { attId } = await ctx.params;
    const id = Number(attId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError("NOT_FOUND", "Lampiran tidak ditemukan.", 404);
    }

    const att = await db.leaveAttachment.findUnique({
      where: { id },
      include: {
        request: {
          include: {
            employee: { select: { teamId: true, sectionId: true, departmentId: true } },
          },
        },
      },
    });
    if (!att) throw new ApiError("NOT_FOUND", "Lampiran tidak ditemukan.", 404);
    if (!canViewRequest(user, att.request)) {
      throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses ke lampiran ini.", 403);
    }

    const fullPath = path.join(process.cwd(), att.filePath);
    let buf: Buffer;
    try {
      buf = await fs.readFile(fullPath);
    } catch {
      throw new ApiError("FILE_NOT_FOUND", "File lampiran tidak ditemukan di server.", 404);
    }

    const ascii = att.originalName.replace(/[^\x20-\x7E]/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
