import db from "./db";

export interface AuditInput {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/** Catat audit trail. Jangan pernah melempar error (audit tidak boleh menggagalkan transaksi). */
export async function auditLog(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId != null ? String(input.entityId) : null,
        oldValue: (input.oldValue ?? null) as never,
        newValue: (input.newValue ?? null) as never,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  } catch (e) {
    console.error("[audit] gagal mencatat:", e);
  }
}

/** Ambil IP & user-agent dari request Next.js untuk audit. */
export function getRequestMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  return {
    ipAddress: fwd?.split(",")[0].trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}
