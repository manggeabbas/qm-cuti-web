import { destroySession, getSessionUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/api";
import { auditLog, getRequestMeta } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const u = await getSessionUser();
    await destroySession();
    if (u) await auditLog({ userId: u.id, action: "LOGOUT", entityType: "User", entityId: u.id, ...getRequestMeta(req) });
    return ok({ message: "Berhasil logout." });
  } catch (e) {
    return toErrorResponse(e);
  }
}
