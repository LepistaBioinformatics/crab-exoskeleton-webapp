import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import Landing from "@/components/landing/Landing";

// Authed users skip straight to the app; everyone else lands on the pre-auth
// marketing page. (`/` is not in the middleware matcher, so it renders for
// unauthenticated visitors instead of bouncing to /signin.)
export default async function RootPage() {
  const session = await getSession();
  if (session) redirect("/chat");
  const locale = await getLocale();
  return <Landing initialLocale={locale} />;
}
