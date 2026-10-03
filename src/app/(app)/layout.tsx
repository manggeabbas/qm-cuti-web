import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user: SessionUser | null = await getSessionUser();
  if (!user) redirect("/login");
  // Karyawan yang belum menyelesaikan onboarding wajib melengkapi data + ganti password dulu
  if (!user.onboardingCompleted) redirect("/onboarding");
  return <AppShell user={user}>{children}</AppShell>;
}
