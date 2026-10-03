import db from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/** GET /api/shifts/patterns — tipe shift + pola jam (butuh login) */
export async function GET() {
  try {
    await requireUser();
    const types = await db.shiftType.findMany({
      where: { isActive: true },
      include: { patterns: { orderBy: { dayOfWeek: "asc" } } },
      orderBy: { code: "asc" },
    });
    return ok({ shiftTypes: types });
  } catch (e) {
    return toErrorResponse(e);
  }
}
