import { NextRequest, NextResponse } from "next/server";
import { proxyRead } from "@/lib/proxyRead";

// One execution's transcript. `run` names a session file, and the proxy resolves it
// against the runs it discovered in the caller's own workspace — this layer only
// forwards it.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyRead(req, (role) => `/${role}/v1/cron/runs`, ["run"]);
}
