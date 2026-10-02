import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  if (u) redirect("/dashboard");
  return <>{children}</>;
}
