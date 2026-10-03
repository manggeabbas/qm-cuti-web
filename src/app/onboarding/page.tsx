import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export const metadata = {
  title: "Lengkapi Data Diri",
};

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboardingCompleted) redirect("/dashboard");
  return <OnboardingForm />;
}
