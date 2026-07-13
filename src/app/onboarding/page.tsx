import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { currentMonthKey } from "@/lib/date";
import { OnboardingForm } from "@/components/onboarding";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return <OnboardingForm month={currentMonthKey()} userName={user.name} />;
}
