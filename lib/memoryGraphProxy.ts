import { NextRequest, NextResponse } from "next/server";
import { proxyRead, type PassThrough } from "@/lib/proxyRead";

// The proxy's read-only knowledge-graph routes (/v1/memory-graph*). All four
// differ only in the path suffix and which extra query parameters they pass
// through; everything above that — session handling, the role→gateway path
// mapping, the error mapping — lives in lib/proxyRead.ts, shared with the other
// read-only member surfaces.
//
// Distinct from /api/memory, which is MEMORY_CUSTOM.md — a different thing with
// its own route.

export type { PassThrough };

export function proxyGraphRead(
  req: NextRequest,
  suffix: string,
  passThrough: PassThrough = [],
): Promise<NextResponse> {
  return proxyRead(req, (role) => `/${role}/v1/memory-graph${suffix}`, passThrough);
}
