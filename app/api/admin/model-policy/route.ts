import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

// The administrator's lock: whether members of a scope may run models of their
// own (user-owned-models R7). Same scope-parameter contract as
// /api/admin/model-defaults — the proxy decides the gate from the identifiers,
// so the BFF forwards them and adds nothing.

const SCOPES = ["global", "agent", "tenant", "subscription"];

function upstreamQuery(req: NextRequest): string | null {
  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  if (!scope || !SCOPES.includes(scope)) return null;
  const out = new URLSearchParams({ scope });
  if (scope === "tenant" || scope === "subscription") {
    const tenantId = p.get("tenant_id");
    if (!tenantId) return null;
    out.set("tenant_id", tenantId);
  }
  if (scope === "subscription") {
    const subsAccId = p.get("subs_acc_id");
    if (!subsAccId) return null;
    out.set("subs_acc_id", subsAccId);
  }
  return out.toString();
}

async function forward(req: NextRequest, method: "GET" | "PUT" | "DELETE") {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const agent = req.nextUrl.searchParams.get("agent");
  const query = upstreamQuery(req);
  if (!agent || !isInstance(agent) || !query) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (method !== "PUT") {
    // No restart policy on any of these: a policy change re-materializes
    // nothing. Affected workspaces re-resolve on their next start, and the
    // member's own screen tells them their selection is blocked.
    return proxyAdminJsonAgent(session, agent, `/model-policy?${query}`, { method });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.allow_user_models !== "boolean") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, `/model-policy?${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allow_user_models: body.allow_user_models }),
  });
}

export const GET = (req: NextRequest) => forward(req, "GET");
export const PUT = (req: NextRequest) => forward(req, "PUT");
export const DELETE = (req: NextRequest) => forward(req, "DELETE");
