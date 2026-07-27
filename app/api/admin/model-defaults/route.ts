import { NextRequest, NextResponse } from "next/server";
import {
  proxyAdminJsonAgent,
  requireSession,
  restartParams,
  withRestart,
} from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

const SCOPES = ["global", "agent", "tenant", "subscription"];

// upstreamQuery forwards only the scope identifiers. The proxy decides the gate
// from them, so the BFF must not add or reinterpret any.
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
    // GET reads; only DELETE mutates and can therefore carry a restart policy.
    const suffix =
      method === "DELETE"
        ? withRestart(`/model-defaults?${query}`, restartParams(req))
        : `/model-defaults?${query}`;
    return proxyAdminJsonAgent(session, agent, suffix, { method });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.model_name !== "string" || !body.model_name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const suffix = withRestart(`/model-defaults?${query}`, restartParams(req));
  return proxyAdminJsonAgent(session, agent, suffix, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_name: body.model_name }),
  });
}

export const GET = (req: NextRequest) => forward(req, "GET");
export const PUT = (req: NextRequest) => forward(req, "PUT");
export const DELETE = (req: NextRequest) => forward(req, "DELETE");
