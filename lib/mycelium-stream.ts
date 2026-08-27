// The mycelium call for the ONE route whose response body is legitimately silent for
// minutes: the chat stream (turn-stream-continuity FR-7 / T-05).
//
// ITS OWN MODULE, NOT lib/mycelium.ts, and that is not tidiness. `lib/mycelium.ts` is
// imported by 52 files, including client components (`app/admin/user-models-panel.tsx`
// is "use client"). Putting `undici` there pulled a Node-only package into the browser
// bundle and the build failed with a wall of `UnhandledSchemeError: Reading from
// "node:assert" is not handled by plugins`. Anything Node-only that the chat stream
// needs belongs here, where only a route handler can reach it.
import { Agent, fetch as undiciFetch } from "undici";
import { MYCELIUM_INTERNAL_URL, MyceliumConnectivityError } from "@/lib/mycelium";

// MEASURED, not assumed (spec OQ-2). A stub upstream that sends SSE headers plus a
// role chunk and then goes quiet, read back through the global fetch on Node v24.18.0
// -- the version the runtime image pins:
//
//   [ 300.8s] THREW: TypeError / terminated / cause=UND_ERR_BODY_TIMEOUT
//
// That is undici's default bodyTimeout. The proxy's own bound on a detached turn is
// turnTimeout = 600s (crab-shell-proxy/internal/httpapi/sse.go), so for the five
// minutes between them the BFF was aborting turns that were still running upstream --
// and the member read it as their internet dropping.
//
// WHY THIS EXISTS EVEN THOUGH THE HEARTBEAT ALREADY FIXES IT. The proxy now writes a
// keep-alive comment every 10s, and the same rig with pings ran the full 330s and
// ended cleanly, so in production this bound is currently unreachable. But the
// heartbeat MASKS it, it does not remove it: a cadence change, a proxy old enough to
// predate the heartbeat, or a regression in that goroutine brings the 300s cut
// straight back -- silently, five minutes into a turn nobody is watching. Defence in
// depth is cheap here; the diagnosis was not.
//
// SCOPED TO THIS ONE CALLER ON PURPOSE (FR-9). Every other route keeps the default,
// where an inactivity bound is a FEATURE: it is the only thing that catches a hung
// upstream on an admin or history call. Exactly one route has a ten-minute quiet
// period as normal behaviour.
//
// undici's own fetch rather than the global one with a `dispatcher` option, so there
// is no question about whose defaults apply. It returns a standard Response, so the
// route's status/ok/body handling is unchanged. `node:http` with setTimeout(0) was
// measured as an equally working alternative (also clean at 310s) and rejected only
// because it would mean rewriting this route's auth and error paths by hand.
const streamAgent = new Agent({ bodyTimeout: 0, headersTimeout: 0 });

export async function fetchMyceliumStream(
  path: string,
  init?: Parameters<typeof undiciFetch>[1],
): Promise<Response> {
  try {
    return (await undiciFetch(`${MYCELIUM_INTERNAL_URL}${path}`, {
      ...init,
      dispatcher: streamAgent,
    })) as unknown as Response;
  } catch (err) {
    throw new MyceliumConnectivityError(
      err instanceof Error ? err.message : "fetch failed",
    );
  }
}
