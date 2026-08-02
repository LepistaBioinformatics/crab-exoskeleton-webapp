import { NextRequest, NextResponse } from "next/server";
import { proxyGraphRead } from "@/lib/memoryGraphProxy";

// open_nodes: full detail for named entities, with the relations among them.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyGraphRead(req, "/nodes", ["names"]);
}
