import { NextRequest, NextResponse } from "next/server";
import { proxyMediaWrite } from "@/lib/mediaFolderProxy";

// Move a file or folder. A move within the same parent is a rename — the proxy
// treats them as one operation, so there is no separate rename route.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return proxyMediaWrite(req, "POST", "/v1/media/move");
}
