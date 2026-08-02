import { NextRequest, NextResponse } from "next/server";
import { proxyGraphRead } from "@/lib/memoryGraphProxy";

// get_recent_changes: what the agent learned inside a time window.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyGraphRead(req, "/recent", ["hours"]);
}
