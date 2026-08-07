import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

interface HistoryResponse {
  messages: {
    role: string;
    content: string;
    created_at?: string;
    // "step" marks the agent narrating its work rather than answering; absent on
    // a plain answer. The model's own chain of thought rides separately.
    kind?: string;
    reasoning?: string;
  }[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instance: string }> },
) {
  const { instance } = await params;
  if (!isInstance(instance)) {
    return NextResponse.json({ error: "invalid_instance" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const subsAccId = req.nextUrl.searchParams.get("subs_acc_id");
  if (!sessionId || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    session_id: sessionId,
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
  });

  let res: Response;
  try {
    res = await fetchMycelium(
      `/${instance}/v1/sessions/history?${query.toString()}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }

  if (res.status === 401) {
    await clearSession();
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }

  const data = (await res.json()) as HistoryResponse;
  // Blank turns are dropped here, at the boundary, so they never reach any
  // consumer's state: the client renders a padded band per message and only the
  // content inside it is conditional, so a blank one is a tall empty gap. An
  // attachment-only message survives (its "[anexo: …]" ref keeps the content
  // non-blank), and so does a reasoning-only step — it carries no text of its own
  // but the chain of thought it holds is the whole point of keeping it.
  const messages = (data.messages ?? []).filter(
    (m) => m.content.trim() !== "" || (m.reasoning ?? "").trim() !== "",
  );
  return NextResponse.json({ messages });
}
