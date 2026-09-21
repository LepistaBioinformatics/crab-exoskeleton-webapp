import { NextRequest, NextResponse } from "next/server";
import { proxyRead } from "@/lib/proxyRead";

// What is waiting on this member right now.
//
// Polled while a turn is running rather than pushed: the harness already emits a
// progress line every few seconds while it waits, so the client knows to look
// without a second streaming channel to keep alive. The window is small -- the
// harness denies after five minutes -- so this is never a long poll.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyRead(req, (role) => `/${role}/v1/approvals/pending`);
}
