import { NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// Selectable models for the caller's agent -- provider/name only, never a key
// (CTX-AMO-06). No scope: the allowlist is declared per-agent in config.yaml,
// not per tenant/subscription. Mirrors app/api/admin/skills/route.ts.
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  return proxyAdminJson(session, "/models", { method: "GET" });
}
