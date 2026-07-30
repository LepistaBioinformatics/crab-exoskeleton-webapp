import { describe, it, expect, vi, afterEach } from "vitest";
import { hasAccount } from "./onboarding";

// Stubs fetch rather than the myceliumRpc module: the bug lived in how a
// non-2xx RPC response is classified, so the response -> status mapping is
// exactly the part worth covering. Each entry answers one call, in the order
// hasAccount makes them (profile.get, then accounts.get).
function stubRpc(...responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = responses[Math.min(call++, responses.length - 1)];
      return new Response(JSON.stringify(r.body ?? {}), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasAccount", () => {
  it("reports an account when accounts.get returns one", async () => {
    stubRpc({ status: 200, body: { result: { id: "acc-1" } } });
    expect(await hasAccount("tok")).toBe("yes");
  });

  it("reports account-less when accounts.get returns null", async () => {
    stubRpc({ status: 200, body: { result: null } });
    expect(await hasAccount("tok")).toBe("no");
  });

  // The bug: an expired token 401s, and treating that as account-less pushed a
  // user who already has an account into onboarding instead of sign-in. An
  // expired token fails both calls, so accounts.get is the one that classifies.
  it("reports expired when the gateway rejects the token", async () => {
    stubRpc({ status: 401, body: { error: "unauthorized" } });
    expect(await hasAccount("stale")).toBe("expired");
  });

  // A user with no account yet has no profile either, and mycelium may well
  // answer that with a 401 too -- reading it would route every new signup to
  // sign-in instead of onboarding. Only accounts.get decides.
  it("does not call a session expired on profile.get's status alone", async () => {
    stubRpc(
      { status: 401, body: { error: "unauthorized" } },
      { status: 200, body: { result: null } },
    );
    expect(await hasAccount("fresh")).toBe("no");
  });

  it("keeps a non-auth accounts.get failure as account-less", async () => {
    stubRpc({ status: 200, body: { result: {} } }, { status: 500, body: { error: "boom" } });
    expect(await hasAccount("tok")).toBe("no");
  });

  it("reports unreachable when the gateway cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await hasAccount("tok")).toBe("unreachable");
  });
});
