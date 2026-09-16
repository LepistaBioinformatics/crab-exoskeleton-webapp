// Server-side only -- the browser never talks to mycelium-gateway directly
// (BFF pattern, see .specs/features/mycelium-chat-webapp/context.md AD-001).
export const MYCELIUM_INTERNAL_URL =
  process.env.MYCELIUM_INTERNAL_URL ?? "http://mycelium-gateway:8080";

// With the gateway rename (service name == guest-role name) the set of agents
// is no longer a fixed allowlist -- any subscribed role is a chattable agent,
// and routing uses the role directly (`/<role>/v1/...`). `Instance` is thus a
// plain role string, and `isInstance` is only a non-empty guard (it does not gate
// which roles are allowed). The former `INSTANCES = ["alpha","beta"]` seed is
// gone: the admin panels now read the agent list from GET /api/admin/agents, so
// nothing in the webapp hardcodes which agents exist.
export type Instance = string;

export function isInstance(value: string): boolean {
  return typeof value === "string" && value.length > 0;
}

export class MyceliumConnectivityError extends Error {}

// The proxy answered but not with 2xx (e.g. 400 bad request, 403 not
// licensed, 409 not scaffolded). Surface its real status + message so the UI
// can show why -- distinct from `connectivity`, which is reserved strictly
// for a caught MyceliumConnectivityError (workspace-selection WS-07). The
// proxy's error body shape isn't fixed, so we probe the common fields and
// fall back to the raw text / status text.
export async function upstreamError(res: Response): Promise<{ error: string; status: number }> {
  const raw = await res.text();
  let message = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    // crab-shell-proxy nests the reason as { error: { message } }; the gateway's
    // own errors use a bare string { error }. Handle both.
    const e = parsed?.error;
    message =
      (typeof e === "string" ? e : e?.message) ??
      parsed?.message ??
      parsed?.detail ??
      message;
  } catch {
    // not JSON -- keep the raw text
  }
  return { error: message || res.statusText || "request failed", status: res.status };
}

// The media surface answers in CODES, not prose.
//
// crab-shell-proxy states its media refusals as English sentences — "file exceeds
// the 10485760-byte limit". `upstreamError` forwards that verbatim, `errorCode`
// passes an unrecognised string through, and `errorText` cannot find it in the
// dictionary: every media failure reached the member as "Algo deu errado.",
// whatever had actually gone wrong. The STATUS is the part that survives
// translation, so it is what these routes forward.
//
// The distinctions the folder operations rely on are preserved — 409 is "that name
// is taken", 404 is "it is already gone", 400 is "that move is not legal" — because
// each keeps its own code. Collapsing them was never the goal; untranslatable prose
// was the problem.
const MEDIA_ERROR_CODES: Record<number, string> = {
  400: "invalid_request",
  403: "forbidden",
  404: "not_found",
  409: "media_name_taken",
  413: "too_large",
};

export function mediaError(res: Response): { error: string; status: number } {
  return { error: MEDIA_ERROR_CODES[res.status] ?? "unknown", status: res.status };
}

// Wraps fetch() against mycelium-gateway so every route handler distinguishes
// "the gateway answered" (even with 401/403/500) from "couldn't reach it at
// all" -- the two need different error shapes downstream (design.md's Error
// Handling Strategy).
export async function fetchMycelium(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${MYCELIUM_INTERNAL_URL}${path}`, init);
  } catch (err) {
    throw new MyceliumConnectivityError(
      err instanceof Error ? err.message : "fetch failed",
    );
  }
}


// JSON-RPC 2.0 call to mycelium's /_adm/rpc, mirroring the reference
// mycelium-webapp `rpcCall`. The beginners account endpoints must go over RPC
// for an internal (magic-link) user: the REST create_default_account is
// external-provider-only ("Invalid provider" 400), whereas the RPC dispatcher
// resolves the internal issuer (verified empirically). Throws
// MyceliumConnectivityError on transport failure (via fetchMycelium); otherwise
// returns a discriminated result ({error} envelopes and non-2xx both -> ok:false).
// The failure arm carries what the gateway actually sent, not just prose.
//
// `/_adm/rpc` answers **HTTP 200 for refusals too** (rpc/handlers.rs), and the
// dispatcher substitutes an anonymous profile rather than rejecting, so a
// permission denial and a malformed call are indistinguishable without the
// JSON-RPC code. `rpcCode` is `error.code` -- note FORBIDDEN is a non-standard
// `-32401`, not one of the spec's reserved values -- and `myc` is
// `error.data.code`, the stable `MYC000xx` discriminator that survives any
// rewording of the message.
//
// `status` stays 400 on this arm so the call sites that predate this keep
// behaving exactly as they did; the two new fields are additive, and mapping
// them to an error code is the routes' job (lib/rpcErrors.ts).
export type RpcResult<R> =
  | { ok: true; result: R }
  | {
      ok: false;
      status: number;
      message: string;
      rpcCode?: number;
      myc?: string;
    };

export async function myceliumRpc<R>(
  method: string,
  params: unknown,
  token: string,
): Promise<RpcResult<R>> {
  const res = await fetchMycelium("/_adm/rpc", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return { ok: false, status, message: error };
  }
  const json = await res.json().catch(() => null);
  if (json?.error) {
    const code = json.error.code;
    const myc = json.error.data?.code;
    return {
      ok: false,
      status: 400,
      message: json.error.message ?? "rpc error",
      rpcCode: typeof code === "number" ? code : undefined,
      myc: typeof myc === "string" && myc.trim() ? myc.trim() : undefined,
    };
  }
  return { ok: true, result: json?.result as R };
}
