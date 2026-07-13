import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Welcome } from "@/components/welcome";

// First-open. If we already know the user (cookie), go straight to the app.
export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <Welcome />;
}
