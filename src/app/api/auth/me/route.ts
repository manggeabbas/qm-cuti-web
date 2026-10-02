import { getSessionUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return fail("UNAUTHORIZED", "Belum login.", 401);
  return ok({ user: u });
}
