import db from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { getPagination, paged } from "@/lib/api";
import { processPendingNotifications } from "@/lib/notify/worker";
import { auditLog, getRequestMeta } from "@/lib/audit";

/** GET /api/notifications?status=&eventType= — log notifikasi (admin) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);
    const status = sp.get("status") as "PENDING" | "SENT" | "FAILED" | null;
    const eventType = sp.get("eventType") ?? undefined;
    const where = {
      ...(status ? { status } : {}),
      ...(eventType ? { eventType: eventType as never } : {}),
    };
    const [total, rows] = await Promise.all([
      db.notification.count({ where }),
      db.notification.findMany({
        where,
        include: { employee: { select: { name: true, nik: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);
    return ok(paged(rows, total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** POST /api/notifications/process — jalankan worker manual (admin) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN");
    const result = await processPendingNotifications();
    await auditLog({ userId: user.id, action: "PROCESS_NOTIFICATIONS", newValue: result, ...getRequestMeta(req) });
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
