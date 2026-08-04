import { NextRequest, NextResponse } from "next/server";
import { proxyRead } from "@/lib/proxyRead";

// The member's scheduled tasks with their executions. See lib/proxyRead.ts for the
// shared session/role plumbing.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyRead(req, (role) => `/${role}/v1/cron/tasks`);
}
