// The mangrove's BFF. One route for every action, because they differ only in
// method and path segment and a file each would be one copy per action of the
// same twelve lines.
//
// THE SESSION TOKEN NEVER REACHES THE BROWSER. It lives in an httpOnly cookie
// and is attached here, server-side, exactly as every other proxy read in this
// app does it. `role` picks the upstream path segment and is never forwarded as
// an identity claim; `tenant_id` and `subs_acc_id` are forwarded and are what
// the proxy authorizes against.
//
// A 404 FROM UPSTREAM MEANS THE FEATURE IS OFF, not that something is missing.
// The proxy does not register these routes when the mangrove is unconfigured, so a
// 404 is an operator's choice rather than a fault — it comes back as `mangrove_off`
// and the tab hides itself. Conflating it with a real error would put a broken
// looking tab in front of every member of every deployment that never enabled
// this.

import { NextRequest, NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";
import { fetchMycelium, isInstance, MyceliumConnectivityError } from "@/lib/mycelium";

/** Which actions exist, and how each is reached. A closed set: an unknown
 *  segment is refused here rather than forwarded upstream to find out. */
const ACTIONS: Record<string, "GET" | "POST"> = {
  timeline: "GET",
  capabilities: "GET",
  directory: "GET",
  identity: "GET",
  admit: "POST",
  decide: "POST",
  revoke: "POST",
  publish: "POST",
  // Passing something already published on to somebody else. The same audience
  // shape publish takes, and the same governing role for a group.
  share: "POST",
  // Takes a graph fragment somebody shared into the caller's own memory. A POST
  // with a JSON body and a JSON answer, so it belongs here; the file DOWNLOAD that
  // arrived with it does not, and has a route of its own beside this one.
  merge: "POST",
};

async function handle(req: NextRequest, action: string) {
  const method = ACTIONS[action];
  if (!method || req.method !== method) {
    return NextResponse.json({ error: "invalid_request" }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  if (!role || !isInstance(role) || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });
  // The project, for the actions that resolve something a project OWNS.
  //
  // Reading the mangrove does not take it -- the network is per subscription and
  // a timeline is the same timeline whichever project is open. But a file path
  // and an entity name are resolved against a WORKSPACE, and each project is a
  // separate one, and so is the object a share names. Forwarded only where it means something, so a read cannot
  // acquire a scope it has no use for.
  const project = p.get("project");
  if (project && (action === "publish" || action === "merge" || action === "share")) {
    query.set("project", project);
  }
  // `reading` is the only extra the mangrove takes, and it is an enum upstream --
  // passing it through unchecked is safe and keeps the allowlist honest about
  // what it allows.
  const reading = p.get("reading");
  if (reading) query.set("reading", reading);
  // The directory's needle. Forwarded as given: what counts as a valid needle
  // is the proxy's call, since only it knows which mode this deployment is in.
  const q = p.get("q");
  if (q) query.set("q", q);

  try {
    const res = await fetchMycelium(`/${role}/v1/mangrove/${action}?${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: await req.text() } : {}),
    });

    if (res.status === 401) {
      await clearSession();
      return NextResponse.json({ error: "session_expired" }, { status: 401 });
    }
    if (res.status === 404) {
      // The operator did not enable the mangrove. Not a fault.
      return NextResponse.json({ error: "mangrove_off" }, { status: 404 });
    }
    if (res.status === 502) {
      // Configured but unreachable -- a DIFFERENT state from "nothing shared
      // yet" and from "switched off", and the screen renders all three
      // differently.
      return NextResponse.json({ error: "mangrove_unreachable" }, { status: 502 });
    }
    if (!res.ok) {
      // A refusal keeps its body: the mangrove names the addressee that was out of
      // reach, and a member who cannot see which one cannot fix it.
      const body = await res.text();
      return new NextResponse(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return handle(req, (await ctx.params).action);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return handle(req, (await ctx.params).action);
}
