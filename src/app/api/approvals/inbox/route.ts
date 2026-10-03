import db from "@/lib/db";
import { ok, toErrorResponse, getPagination, paged } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canApproveStep, PENDING_STATUSES } from "@/lib/leave/workflow";

/**
 * GET /api/approvals/inbox
 * Daftar pengajuan yang menunggu approval dari user yang login.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const { page, limit, skip } = getPagination(sp);

    if (!user.employee && !user.roles.includes("ADMIN")) {
      return ok(paged([], 0, page, limit));
    }

    const candidates = await db.leaveRequest.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        ...(user.employeeId != null ? { employeeId: { not: user.employeeId } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            nik: true,
            teamId: true,
            sectionId: true,
            departmentId: true,
            divisionId: true,
            team: { select: { name: true } },
          },
        },
        leaveType: { select: { id: true, code: true, name: true, category: true } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
      orderBy: { submittedAt: "asc" },
      take: 500,
    });

    const allowed: typeof candidates = [];
    for (const r of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await canApproveStep(user, r)) allowed.push(r);
    }

    const items = allowed.slice(skip, skip + limit).map((r) => ({
      id: r.id,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      totalDays: r.totalDays,
      reason: r.reason,
      submittedAt: r.submittedAt,
      currentStepOrder: r.currentStepOrder,
      employee: {
        id: r.employee.id,
        name: r.employee.name,
        nik: r.employee.nik,
        team: r.employee.team.name,
      },
      leaveType: r.leaveType,
    }));

    return ok(paged(items, allowed.length, page, limit));
  } catch (e) {
    return toErrorResponse(e);
  }
}
