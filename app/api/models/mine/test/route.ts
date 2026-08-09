import { NextRequest } from "next/server";
import { callUserModels, userModelBody } from "../proxy";

// The connectivity probe. The draft — including the key — travels in the body
// and is forwarded to the proxy, which makes the actual outbound request: the
// browser cannot reach an arbitrary provider through CORS, and the key must not
// be handled anywhere it could be logged.
//
// Nothing here is stored. A 429 from the proxy is its per-account floor between
// probes, and is passed through as-is so the screen can say "wait a moment"
// rather than "failed".
export async function POST(req: NextRequest) {
  const parsed = await userModelBody(req);
  if ("error" in parsed) return parsed.error;
  return callUserModels(parsed.role, `/test?${parsed.query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}
