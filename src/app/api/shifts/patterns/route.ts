import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { auditLog, getRequestMeta } from "@/lib/audit";
import { generateRoster } from "@/lib/scheduling";
import { parseISODate, toISODate } from "@/lib/dates";

/** GET /api/shifts/patterns — tipe shift + pola jam */
export async function GET() {
  const types = await db.shiftType.findMany({
    where: { isActive: true },
    include: { patterns: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { code: "asc" },
  });
  return ok({ shiftTypes: types });
}
