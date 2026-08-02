import { NextRequest, NextResponse } from "next/server";
import { proxyGraphRead } from "@/lib/memoryGraphProxy";

// read_graph. See lib/memoryGraphProxy.ts for the shared plumbing.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyGraphRead(req, "", ["detail_level", "include_archived", "include_merged"]);
}
