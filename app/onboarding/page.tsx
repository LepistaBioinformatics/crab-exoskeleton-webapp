import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasAccount } from "@/lib/onboarding";
import OnboardingWelcome from "./onboarding-welcome";

// Server guard: a user who already has an account (flag set, or detection says
// "yes") never lingers on onboarding (onboarding OB-02). An expired session goes
// back to sign-in -- showing it the welcome only leads to a 401 on "Vamos
// começar". Anyone else -- "no" or even "unreachable" -- sees the welcome and can
// trigger the create.
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/signin");

  if (session.accountReady) redirect("/chat");

  const status = await hasAccount(session.token);
  if (status === "yes") redirect("/chat");
  if (status === "expired") redirect("/signin");

  return <OnboardingWelcome email={session.email} />;
}
