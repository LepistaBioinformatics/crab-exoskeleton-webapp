// Turning a mycelium JSON-RPC failure into one of the app's error codes.
//
// This exists because the transport cannot do it honestly. `/_adm/rpc` answers
// HTTP 200 for every outcome, so the status line says nothing; the classification
// lives entirely in `error.code`, and the gateway's vocabulary is not the JSON-RPC
// spec's -- `FORBIDDEN` is `-32401` (rpc/types.rs), a value the spec reserves for
// nothing.
//
// Without this every refusal in the admin console rendered as "Something went
// wrong", which is the least useful thing you can tell someone who was refused.

import type { RpcResult } from "@/lib/mycelium";

export const RPC_FORBIDDEN = -32401;
export const RPC_INVALID_PARAMS = -32602;

type RpcFailure = Extract<RpcResult<unknown>, { ok: false }>;

// The HTTP status a BFF route should answer with, so the client's own
// `errorCode(res)` fallbacks line up with what actually happened.
export function httpStatusFor(failure: RpcFailure): number {
  if (failure.rpcCode === RPC_FORBIDDEN) return 403;
  if (failure.rpcCode === RPC_INVALID_PARAMS) return 400;
  return failure.status;
}

// The app error code for a failed RPC.
//
// `-32602` deserves a word. It is also how "that tenant is not yours" arrives:
// `update_tenant_name_and_description` carries no Profile guard at all and scopes
// by `get_tenant_owned_by_me`, so a non-owner gets NotFound -> MYC00013 ->
// INVALID_PARAMS. The gateway genuinely cannot tell the caller which it was, so
// neither can we -- `tenantMutationError` below is what the tenant panels use to
// say both out loud instead of picking one and being wrong half the time.
export function rpcErrorCode(failure: RpcFailure): string {
  if (failure.rpcCode === RPC_FORBIDDEN) return "forbidden";
  if (failure.rpcCode === RPC_INVALID_PARAMS) return "invalid_request";
  return "unknown";
}

// The tenant mutators' version: an INVALID_PARAMS from one of them means the
// tenant was not found OR is not owned by the caller, and the UI says so.
export function tenantMutationError(failure: RpcFailure): string {
  if (failure.rpcCode === RPC_INVALID_PARAMS) return "tenant_not_found_or_not_owned";
  return rpcErrorCode(failure);
}
