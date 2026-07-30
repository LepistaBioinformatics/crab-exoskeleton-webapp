import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isSessionExpired, parseSession } from "@/lib/session";

// The guarded routes need a session that is at least still within its own
// lifetime, so there are two checks now: the cookie has to be readable, and the
// token it carries must not be past its own `exp`.
//
// What this is NOT is validation. A token can be rejected upstream while its
// `exp` is still in the future (revoked, or the gateway rotated keys), so the real
// answer still comes from mycelium on the first /api/chat/* call — which clears
// the session on a 401, as it always did.
//
// Clearing the cookie is why this lives here rather than in the pages: a
// middleware response can carry a Set-Cookie and a Server Component cannot touch
// cookies at all. Without it the dead cookie survived every redirect, so `/`
// (authed → /chat) kept bouncing the visitor through /chat to /signin on every
// visit until they signed in again.
export function middleware(req: NextRequest) {
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session || isSessionExpired(session)) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    // Drop the query with it: /signin reads `?step=`/`?email=` now, and carrying
    // over whatever was on /chat could land the visitor on the code form for an
    // address they never entered.
    url.search = "";
    const res = NextResponse.redirect(url);
    // Same path the cookie was set with (lib/session.ts), or the browser keeps
    // the old one alongside the deletion.
    res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/onboarding/:path*"],
};
