import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { startAtSignin } from "@/lib/appConfig";
import Landing from "@/components/landing/Landing";

// Authed users skip straight to the app; everyone else lands on the pre-auth
// marketing page. (`/` is not in the middleware matcher, so it renders for
// unauthenticated visitors instead of bouncing to /signin.)
//
// With START_AT_SIGNIN set, the landing is skipped and `/` becomes the sign-in
// screen. `/` is the only route that mounts Landing, so the flag makes the
// marketing page — and the Lepista brand bar embedded in it — unreachable, which
// is the point for a deployment running under its own brand.
export default async function RootPage() {
  const session = await getSession();
  if (session) redirect("/chat");
  if (startAtSignin()) redirect("/signin");
  return <Landing />;
}
