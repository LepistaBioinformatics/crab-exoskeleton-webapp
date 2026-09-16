import { describe, it, expect } from "vitest";
import {
  RPC_FORBIDDEN,
  RPC_INVALID_PARAMS,
  httpStatusFor,
  rpcErrorCode,
  tenantMutationError,
} from "./rpcErrors";

const failure = (rpcCode?: number, myc?: string) =>
  ({ ok: false, status: 400, message: "refused", rpcCode, myc }) as const;

describe("rpcErrorCode", () => {
  // -32401 is the gateway's own value for FORBIDDEN; the JSON-RPC spec reserves
  // nothing there, so nothing but this mapping identifies a permission refusal.
  it("reads the gateway's non-standard FORBIDDEN as a permission refusal", () => {
    expect(rpcErrorCode(failure(RPC_FORBIDDEN))).toBe("forbidden");
  });

  it("reads INVALID_PARAMS as a bad request", () => {
    expect(rpcErrorCode(failure(RPC_INVALID_PARAMS))).toBe("invalid_request");
  });

  // An unclassified failure must not borrow a classification. Defaulting to
  // "forbidden" would tell people they lack permission for a gateway bug.
  it("does not guess at an unfamiliar code", () => {
    expect(rpcErrorCode(failure(-32000))).toBe("unknown");
    expect(rpcErrorCode(failure(undefined))).toBe("unknown");
  });
});

describe("httpStatusFor", () => {
  it("maps the two known codes onto the statuses the client already understands", () => {
    expect(httpStatusFor(failure(RPC_FORBIDDEN))).toBe(403);
    expect(httpStatusFor(failure(RPC_INVALID_PARAMS))).toBe(400);
  });

  it("keeps the transport's own status otherwise", () => {
    expect(httpStatusFor(failure(-32000))).toBe(400);
  });
});

describe("tenantMutationError", () => {
  // The tenant mutators carry no Profile guard and scope by ownership, so a
  // non-owner gets NotFound -> MYC00013 -> INVALID_PARAMS. "Wrong id" and "not
  // yours" are the same answer on the wire, and the copy has to say both rather
  // than pick one and be wrong half the time.
  it("says both things INVALID_PARAMS can mean for a tenant write", () => {
    expect(tenantMutationError(failure(RPC_INVALID_PARAMS))).toBe(
      "tenant_not_found_or_not_owned",
    );
  });

  it("leaves every other code to the general mapping", () => {
    expect(tenantMutationError(failure(RPC_FORBIDDEN))).toBe("forbidden");
    expect(tenantMutationError(failure(-32000))).toBe("unknown");
  });
});
