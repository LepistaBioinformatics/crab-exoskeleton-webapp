import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasAccount } from "@/lib/onboarding";
import ChatShell from "../chat-shell";
import ConnectivityError from "../connectivity-error";

// ONE page for both /chat and /chat/projects/<id>.
//
// It is a catch-all rather than two page files, and that is a rendering
// decision, not a routing convenience. Two sibling pages are two different
// component trees: navigating between them unmounts the whole shell and mounts
// another, so entering a project threw away the sidebar, the loaded
// conversation, the turn in flight — everything — and read as a full page
// reload even though router.push never left the client.
//
// With one page file the tree keeps its identity across the navigation. React
// reconciles, only `project` changes, and the parts that should survive do.
//
// The workspace ids stay in the fragment where they have always been: never sent
// to a server, so they never reach a request log. Only the project is in the
// path, because only the project needs to be a navigation.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;

  // /chat -> no segments. /chat/projects/<id> -> exactly ["projects", id].
  // Anything else is not a route this app defines.
  let project: string | null = null;
  if (slug && slug.length > 0) {
    if (slug.length !== 2 || slug[0] !== "projects" || !slug[1]) redirect("/chat");
    project = decodeURIComponent(slug[1]);
  }

  const session = await getSession();
  if (!session) return <ChatShell email="" project={project} />;

  // Same onboarding gate as before: an account-less user goes to onboarding, an
  // expired session back to sign-in (it has an account, it just cannot prove it
  // anymore), a transport failure to a real error. The flag caches a "yes" so
  // this probes at most once per session.
  if (!session.accountReady) {
    const status = await hasAccount(session.token);
    if (status === "expired") redirect("/signin");
    if (status === "no") redirect("/onboarding");
    if (status === "unreachable") return <ConnectivityError />;
  }

  return <ChatShell email={session.email} project={project} />;
}
