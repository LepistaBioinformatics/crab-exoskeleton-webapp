import { NextResponse } from "next/server";
import { myceliumRpc, MyceliumConnectivityError } from "@/lib/mycelium";
import { requireSession } from "@/lib/adminProxy";
import { callerProfile, canManageDirectory, type CallerProfile } from "@/lib/callerProfile";
import { httpStatusFor, rpcErrorCode } from "@/lib/rpcErrors";
import type { SessionCookie } from "@/lib/session";

// The shared middle of every directory route: a session, a caller who may use
// this area, and one RPC call whose refusal is reported for what it was.
//
// `app/api/invitations/route.ts` grew a local version of the last part when it
// was the only RPC route. There are five now, and the part worth sharing is not
// the fetch -- it is the error mapping, which is the whole reason this feature
// touched the transport.

export type Guarded =
  | { ok: true; session: SessionCookie; profile: CallerProfile }
  | { ok: false; response: NextResponse };

// A session, plus a profile that is staff or manager.
//
// The gateway is still the real gate -- every use-case checks the profile it
// resolves from the token, and this cannot and does not substitute for that. What
// it buys is an honest 403 at the door instead of a scattering of refusals from
// individual calls, which is the difference between "you cannot use this screen"
// and "every button on this screen is broken".
export async function requireDirectoryAdmin(): Promise<Guarded> {
  const session = await requireSession();
  if (session instanceof NextResponse) return { ok: false, response: session };

  const profile = await callerProfile(session.token);
  if (!canManageDirectory(profile)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session, profile: profile as CallerProfile };
}

// One RPC call, with the failure translated once.
//
// `mapError` lets a caller widen the classification for its own methods -- the
// tenant mutators need it, because an INVALID_PARAMS from them also means "not
// yours" and no other route has that ambiguity.
export async function callRpc<R>(
  session: SessionCookie,
  method: string,
  params: unknown,
  mapError?: (failure: Extract<Awaited<ReturnType<typeof myceliumRpc>>, { ok: false }>) => string,
): Promise<{ ok: true; result: R } | NextResponse> {
  let out;
  try {
    out = await myceliumRpc<R>(method, params, session.token);
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }

  if (!out.ok) {
    const code = (mapError ?? rpcErrorCode)(out);
    return NextResponse.json({ error: code }, { status: httpStatusFor(out) });
  }
  return { ok: true, result: out.result };
}

// A required string field from a body or a query string. Trimmed, and empty
// counts as absent -- an empty tenant name is not a name.
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// A page size the caller may narrow but not remove.
//
// EXPLICIT ON EVERY CALL, and this is not defensive style: mycelium's repositories
// default `page_size` to TEN. A directory screen that inherited that default would
// show ten tenants and call it the list.
export function pageSize(raw: string | null, fallback = 200): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : fallback;
}
