import { NextRequest, NextResponse } from "next/server";
import { proxyWrite } from "@/lib/proxyRead";

// Allow or refuse one blocked tool call.
//
// The member's answer is the only thing that unblocks it: a turn is waiting on
// this request, and the harness denies on its own deadline if nothing comes.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return proxyWrite(req, (role) => `/${role}/v1/approvals/answer`);
}
