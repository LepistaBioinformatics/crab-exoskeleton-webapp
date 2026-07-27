import { describe, it, expect } from "vitest";
import { ALL_AGENTS } from "./admin";
import { restartBody, __testing } from "./adminRestart";

const { targetQuery } = __testing;

describe("targetQuery", () => {
  it("carries the tenant alone for a tenant-wide target", () => {
    expect(targetQuery({ tenantId: "t1" })).toBe("tenantId=t1");
  });

  it("adds the subscription and the agent when both are present", () => {
    const q = new URLSearchParams(targetQuery({ tenantId: "t1", subsAccId: "s1", agent: "alpha" }));
    expect(q.get("tenantId")).toBe("t1");
    expect(q.get("subsAccId")).toBe("s1");
    expect(q.get("agent")).toBe("alpha");
  });

  // ALL_AGENTS is a picker sentinel, not an agent key. Forwarded, the proxy would
  // look for a record filed under an agent literally named "all", find nothing,
  // and report the scope clean while a scope-wide notice sat unread.
  it("drops the all-agents sentinel instead of sending it as an agent", () => {
    const q = new URLSearchParams(targetQuery({ tenantId: "t1", agent: ALL_AGENTS }));
    expect(q.has("agent")).toBe(false);
  });
});

describe("restartBody", () => {
  it("sends the mode and the scope, and nothing it was not given", () => {
    expect(restartBody({ tenantId: "t1" }, { mode: "now" })).toEqual({
      tenantId: "t1",
      mode: "now",
    });
  });

  it("drops the all-agents sentinel here too", () => {
    const body = restartBody({ tenantId: "t1", agent: ALL_AGENTS }, { mode: "notice" });
    expect(body.agent).toBeUndefined();
  });

  // The picker yields a local "YYYY-MM-DDTHH:mm"; the proxy wants an instant.
  it("converts a scheduled local time to a UTC instant", () => {
    const body = restartBody({ tenantId: "t1" }, { mode: "schedule", at: "2030-01-02T03:04" });
    expect(body.at).toBe(new Date("2030-01-02T03:04").toISOString());
  });

  it("omits an unparseable time rather than sending garbage the proxy would 400", () => {
    const body = restartBody({ tenantId: "t1" }, { mode: "schedule", at: "not-a-time" });
    expect(body.at).toBeUndefined();
  });

  it("sends `at` only for a schedule", () => {
    expect(restartBody({ tenantId: "t1" }, { mode: "notice", at: "2030-01-02T03:04" }).at)
      .toBeUndefined();
  });

  it("carries the note when there is one", () => {
    expect(restartBody({ tenantId: "t1" }, { mode: "notice", note: "key rotation" }).note).toBe(
      "key rotation",
    );
  });

  // An admin acting outside a save has no content-derived cause, and the proxy
  // records admin-request for exactly that case. Sending one would mislabel it.
  it("never sends a reason", () => {
    expect(restartBody({ tenantId: "t1" }, { mode: "now" }).reason).toBeUndefined();
  });
});
