import { z } from "zod";
import db from "@/lib/db";
import { ok, fail, toErrorResponse, ApiError } from "@/lib/api";
import { requireUser, hashPassword } from "@/lib/auth";
import { auditLog, getRequestMeta } from "@/lib/audit";

/**
 * GET /api/onboarding — status & data awal untuk halaman onboarding.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const full = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        onboardingCompleted: true,
        employee: {
          select: {
            id: true,
            nik: true,
            name: true,
            gender: true,
            phone: true,
            email: true,
            position: { select: { name: true } },
            team: { select: { name: true } },
          },
        },
      },
    });
    if (!full) throw new ApiError("NOT_FOUND", "Pengguna tidak ditemukan.", 404);
    return ok({
      completed: full.onboardingCompleted,
      username: full.username,
      employee: full.employee,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const completeSchema = z.object({
  gender: z.enum(["LAKI_LAKI", "PEREMPUAN"], { message: "Jenis kelamin wajib dipilih." }).optional(),
  phone: z.string().trim().min(9, "Nomor telepon minimal 9 digit.").max(20, "Nomor telepon maksimal 20 karakter.")
    .regex(/^[0-9+()\-.\s]+$/, "Nomor telepon hanya boleh berisi angka dan +()-.").optional(),
  email: z.string().trim().max(100).email("Format email tidak valid.").optional().or(z.literal("")),
  newPassword: z.string().min(6, "Password minimal 6 karakter.").max(100),
  confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi."),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Konfirmasi password tidak sama.",
  path: ["confirmPassword"],
});

/**
 * POST /api/onboarding — selesaikan onboarding: lengkapi data diri + ganti password.
 * Kedua-duanya wajib dalam satu pengajuan.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = completeSchema.parse(await req.json());

    const full = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, employeeId: true, onboardingCompleted: true },
    });
    if (!full) throw new ApiError("NOT_FOUND", "Pengguna tidak ditemukan.", 404);
    if (full.onboardingCompleted) {
      throw new ApiError("ALREADY_COMPLETED", "Onboarding sudah diselesaikan sebelumnya.", 400);
    }

    // Data diri wajib bagi yang terhubung ke data karyawan
    if (full.employeeId) {
      const emp = await db.employee.findUnique({
        where: { id: full.employeeId },
        select: { gender: true },
      });
      if (!body.gender && !emp?.gender) {
        return fail("VALIDATION_ERROR", "Jenis kelamin wajib dipilih.", 422);
      }
      if (!body.phone?.trim()) {
        return fail("VALIDATION_ERROR", "Nomor telepon wajib diisi.", 422);
      }
      if (!body.email?.trim()) {
        return fail("VALIDATION_ERROR", "Email wajib diisi.", 422);
      }
    }

    const passwordHash = await hashPassword(body.newPassword);
    await db.$transaction(async (tx) => {
      if (full.employeeId) {
        await tx.employee.update({
          where: { id: full.employeeId },
          data: {
            // gender hanya diisi bila belum ada (admin mungkin sudah mengisi)
            ...(body.gender ? { gender: body.gender } : {}),
            phone: body.phone!.trim(),
            email: body.email!.trim() || null,
          },
        });
      }
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, onboardingCompleted: true },
      });
    });

    await auditLog({
      userId: user.id,
      action: "ONBOARDING_COMPLETED",
      entityType: "User",
      entityId: user.id,
      ...getRequestMeta(req),
    });

    return ok({ completed: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("VALIDATION_ERROR", e.issues[0]?.message ?? "Input tidak valid.", 422);
    }
    return toErrorResponse(e);
  }
}
