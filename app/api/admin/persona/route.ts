import { NextRequest, NextResponse } from "next/server";
import {
  adminScopeQuery,
  isAdminScope,
  proxyAdminJson,
  restartParams,
  withRestart,
  requireSession,
} from "@/lib/adminProxy";

// The agent's identity files at a scope: list what is injected here / inject or
// replace one / drop an injection. Mirrors app/api/admin/skills/route.ts.
//
// Two things differ from the skills route, both because the proxy enforces them and
// a BFF that forwarded the request anyway would only turn a clear 400 into a
// confusing one:
//
//   - `agent` is REQUIRED. The persona cascade has no agent-less layer.
//   - `name` must be one of the four known files. These write into a workspace ROOT.
const PERSONA_FILES = ["AGENT.md", "SOUL.md", "HEARTBEAT.md", "USER.md"];

function isPersonaFile(value: unknown): boolean {
  return typeof value === "string" && PERSONA_FILES.includes(value);
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const agent = p.get("agent");
  if (!isAdminScope(scope) || !tenantId || !agent) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = adminScopeQuery(scope, tenantId, subsAccId, agent);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/persona?${query.toString()}`, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const scope = form.get("scope");
  const tenantId = form.get("tenant_id");
  const subsAccId = form.get("subs_acc_id");
  const agent = form.get("agent");
  const name = form.get("name");
  const body = form.get("body");
  if (!isAdminScope(scope) || typeof tenantId !== "string" || typeof agent !== "string" || !agent) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && typeof subsAccId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isPersonaFile(name) || typeof body !== "string" || body.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Urlencoded upstream, NOT multipart like /api/admin/skills. These are text
  // fields with no file part, and the deployed proxy's persona handler parses
  // only urlencoded bodies: it calls ParseForm, which on a multipart body fills
  // r.Form from the query string alone and left every field empty, so each save
  // came back `"tenant_id" is required and must be a UUID`. The proxy fix accepts
  // both encodings, so this works before and after that deploy.
  const upstream = new URLSearchParams();
  upstream.set("scope", scope);
  upstream.set("tenant_id", tenantId);
  if (scope === "subscription" && typeof subsAccId === "string") {
    upstream.set("subs_acc_id", subsAccId);
  }
  upstream.set("agent", agent);
  upstream.set("name", name as string);
  upstream.set("body", body);

  const suffix = withRestart("/persona", restartParams(req));
  return proxyAdminJson(session, suffix, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: upstream,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const agent = p.get("agent");
  const name = p.get("name");
  if (!isAdminScope(scope) || !tenantId || !agent || !isPersonaFile(name)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = adminScopeQuery(scope, tenantId, subsAccId, agent);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  query.set("name", name as string);

  const suffix = withRestart(`/persona?${query.toString()}`, restartParams(req));
  return proxyAdminJson(session, suffix, { method: "DELETE" });
}
