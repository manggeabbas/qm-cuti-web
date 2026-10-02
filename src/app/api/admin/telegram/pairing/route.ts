import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { makePairingCode } from "@/lib/notify/pairing";

/** GET /api/admin/telegram/pairing?employeeId= — buat kode pairing untuk karyawan */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const sp = new URL(req.url).searchParams;
    const employeeId = Number(sp.get("employeeId"));
    if (!employeeId) return fail("VALIDATION_ERROR", "employeeId wajib.", 422);
    const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, nik: true } });
    if (!emp) return fail("NOT_FOUND", "Karyawan tidak ditemukan.", 404);
    const code = makePairingCode(employeeId);
    await auditLog({ userId: user.id, action: "GENERATE_PAIRING_CODE", entityType: "Employee", entityId: employeeId, ...getRequestMeta(req) });
    return ok({
      employee: emp,
      code,
      instruction: `Karyawan membuka bot Telegram lalu kirim: /start ${code}`,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
