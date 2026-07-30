import { cookies } from "next/headers";

export const SESSION_COOKIE = "myc_session";

export interface SessionCookie {
  token: string;
  email: string;
  // Set once mycelium detection resolves "yes" or after a successful onboarding
  // create, so the chat entry probes account existence at most once per session
  // (a UX optimization -- the proxy authz still gates access, see onboarding
  // design.md R2).
  accountReady?: boolean;
}

export async function setSession(session: SessionCookie): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    // This stack has no TLS in front of any service (mycelium-gateway's own
    // `tls = "disabled"`, see mycelium/config.standalone.toml) -- a `Secure`
    // cookie here would be set but never sent back by the browser over
    // plain HTTP, silently breaking every session (verified empirically:
    // curl doesn't care and hid this, a real browser would).
    secure: false,
    path: "/",
  });
}

// Pure cookie parse, split out so the middleware can reuse it: middleware runs on
// the edge runtime and cannot import next/headers, so it reads the raw value off
// the request instead.
export function parseSession(raw: string | undefined): SessionCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && typeof parsed?.email === "string") {
      return parsed as SessionCookie;
    }
    return null;
  } catch {
    return null;
  }
}

// The token's `exp` claim as epoch milliseconds, or null when there is no claim we
// can read. Deliberately tolerant: mycelium issues a JWT (the gateway verifies it
// and injects the profile), but this decodes WITHOUT verifying a signature, which
// is only sound because the answer is used to expire a session early -- never to
// grant access. Anything unreadable returns null and the session is treated as
// live, exactly as it was before this check existed; the gateway is still the one
// that decides whether a token is good.
//
// `atob` rather than Buffer: this has to run on the edge runtime too.
export function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    // `exp` is in SECONDS per RFC 7519.
    return typeof claims?.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Whether the cookie's token is past its own expiry. Compared against this
// server's clock: a host whose clock runs ahead of the gateway's would end
// sessions early, which is an infrastructure problem rather than something a
// leeway constant here would fix.
export function isSessionExpired(session: SessionCookie, now: number = Date.now()): boolean {
  const exp = tokenExpiry(session.token);
  return exp !== null && exp <= now;
}

// An expired token is NOT a session. Every caller -- route handlers via
// requireSession, the pages via their own guards -- then answers the way it
// already answers for "not signed in", instead of carrying a token that can only
// earn a 401 upstream. This is what stops an expired session from being mistaken
// for an account-less one, which used to route the user to onboarding.
export async function getSession(): Promise<SessionCookie | null> {
  const store = await cookies();
  const session = parseSession(store.get(SESSION_COOKIE)?.value);
  if (!session || isSessionExpired(session)) return null;
  return session;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
