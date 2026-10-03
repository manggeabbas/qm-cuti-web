import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ok, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

/** GET /api/admin/audit-logs — riwayat audit trail (admin saja) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, "ADMIN", "SPV", "WSPV");

    const searchParams = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(searchParams);
    const action = searchParams.get("action")?.trim() || null;
    const entityType = searchParams.get("entityType")?.trim() || null;
    const search = searchParams.get("search")?.trim() || null;

    const where: Prisma.AuditLogWhereInput = {
      ...(action
        ? { action: { contains: action, mode: "insensitive" } }
        : {}),
      ...(entityType
        ? { entityType: { contains: entityType, mode: "insensitive" } }
        : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              {
                user: {
                  username: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await db.$transaction([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      username: r.user?.username ?? null,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      oldValue: r.oldValue,
      newValue: r.newValue,
    }));

    return ok(paged(items, total, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}
