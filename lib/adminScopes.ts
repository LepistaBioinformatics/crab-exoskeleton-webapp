import { NextResponse } from "next/server";
import { forwardAdmin } from "@/lib/adminProxy";
import type { SessionCookie } from "@/lib/session";
import type { AdminScope } from "@/lib/admin";

// Server-side: the scopes the caller may administer, from the same `/scopes`
// gateway endpoint the admin screen uses. Any failure (connectivity, expired
// session, upstream 4xx) resolves to an empty list so the native-secret gate
// denies by default rather than opening on error.
export async function fetchCallerScopes(session: SessionCookie): Promise<AdminScope[]> {
  const out = await forwardAdmin(session, "/scopes", { method: "GET" });
  if (out instanceof NextResponse || !out.ok) return [];
  const data = await out.json().catch(() => ({}));
  return Array.isArray(data.scopes) ? (data.scopes as AdminScope[]) : [];
}
