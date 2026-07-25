import { NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// The agent keys this deployment runs, from the proxy's own config. Replaces the
// hardcoded `["alpha","beta"]` seed the admin panels used to import from
// lib/mycelium.ts, so adding an agent to the proxy's config.yaml is enough for it
// to appear as an injection target. Keys only — the proxy never returns an
// agent's image, model or key.
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  return proxyAdminJson(session, "/agents", { method: "GET" });
}
