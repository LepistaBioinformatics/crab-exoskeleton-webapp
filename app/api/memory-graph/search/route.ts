import { NextRequest, NextResponse } from "next/server";
import { proxyGraphRead } from "@/lib/memoryGraphProxy";

// The same BM25 ranking the agent's semantic_search tool uses, so the member and
// the bot get the same answer to the same query.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyGraphRead(req, "/search", ["query", "k", "threshold"]);
}
