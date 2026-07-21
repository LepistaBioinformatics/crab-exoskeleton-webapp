import { NextResponse } from "next/server";
import { fetchMycelium, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";

interface Tool {
  name: string;
  description: string;
  capabilities: string[];
  toolType: string;
  isContextApi: boolean;
  openapiPath: string;
  healthStatus: unknown;
}

interface ToolsResponse {
  tools?: Tool[];
}

// Tool discovery. The gateway's `/tools` endpoint is PUBLIC (no auth), listing
// every registered service/tool with `name === role`. Used only to ENRICH the
// sidebar agent list (description tooltip + health), never to gate it -- so a
// connectivity failure or upstream error just yields no enrichment.
export async function GET() {
  let res: Response;
  try {
    res = await fetchMycelium("/tools");
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }

  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }

  const data = (await res.json()) as ToolsResponse;
  return NextResponse.json({ tools: data.tools ?? [] });
}
