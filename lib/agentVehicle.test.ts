import { afterEach, describe, expect, it, vi } from "vitest";
import { candidateRoles, resolveVehicleAgent, serviceNames } from "./agentVehicle";

const { myceliumRpc, fetchMycelium } = vi.hoisted(() => ({
  myceliumRpc: vi.fn(),
  fetchMycelium: vi.fn(),
}));
vi.mock("@/lib/mycelium", () => ({ myceliumRpc, fetchMycelium }));

function toolsResponse(names: string[], key: "tools" | "contexts" = "tools") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ [key]: names.map((name) => ({ name })) }),
  } as unknown as Response;
}

function profile(records: { role: string; sysAcc?: boolean }[]) {
  return { ok: true, result: { licensedResources: { records } } };
}

afterEach(() => vi.clearAllMocks());

describe("candidateRoles", () => {
  it("keeps ordinary grants and drops management ones", () => {
    // The shape that motivated the sysAcc filter: an operator who administers the
    // subscription AND is a member of the agent.
    expect(
      candidateRoles({
        licensedResources: {
          records: [
            { role: "subscriptions-manager", sysAcc: true },
            { role: "tenant-manager", sysAcc: true },
            { role: "zcrab", sysAcc: false },
          ],
        },
      }),
    ).toEqual(["zcrab"]);
  });

  it("reads the compact url variant and drops s=1 there too", () => {
    expect(
      candidateRoles({
        licensedResources: {
          urls: [
            "t/aa/a/bb/r/cc?p=subscriptions-manager:1&s=1&v=1&n=QQ",
            "t/aa/a/dd/r/ee?p=zcrab:1&s=0&v=1&n=Qg",
          ],
        },
      }),
    ).toEqual(["zcrab"]);
  });

  it("dedupes and skips blank roles", () => {
    expect(
      candidateRoles({
        licensedResources: {
          records: [{ role: "beta" }, { role: "  " }, { role: "beta" }, { role: "" }],
        },
      }),
    ).toEqual(["beta"]);
  });

  it("is empty when there is nothing to pick", () => {
    expect(candidateRoles(null)).toEqual([]);
    expect(candidateRoles({})).toEqual([]);
    expect(candidateRoles({ licensedResources: { records: [] } })).toEqual([]);
  });
});

describe("serviceNames", () => {
  it("collects from tools and contexts alike", () => {
    // Both are the same Tool shape, split by isContextApi; both are routable.
    expect(
      serviceNames({ tools: [{ name: "zcrab" }], contexts: [{ name: "ctx-api" }] }),
    ).toEqual(new Set(["zcrab", "ctx-api"]));
  });

  it("survives a payload that carries neither", () => {
    expect(serviceNames({})).toEqual(new Set());
    expect(serviceNames(null)).toEqual(new Set());
    expect(serviceNames({ tools: "nope" })).toEqual(new Set());
  });
});

describe("resolveVehicleAgent", () => {
  it("picks the role the gateway confirms it routes, not merely the first", async () => {
    // The whole point: `other-service` comes first in the profile but names no
    // agent this gateway declares, so routing through it would 400.
    myceliumRpc.mockResolvedValue(
      profile([{ role: "other-service" }, { role: "zcrab" }]),
    );
    fetchMycelium.mockResolvedValue(toolsResponse(["zcrab"]));

    await expect(resolveVehicleAgent("jwt")).resolves.toBe("zcrab");
    expect(myceliumRpc).toHaveBeenCalledWith(
      "beginners.profile.get",
      { withUrl: false },
      "jwt",
    );
    expect(fetchMycelium).toHaveBeenCalledWith("/tools", { cache: "no-store" });
  });

  it("falls back to the profile order when the catalog says nothing", async () => {
    // 204, an older gateway without /tools, or discoverable=false everywhere.
    // "Could not tell" must not veto a role the profile vouched for.
    myceliumRpc.mockResolvedValue(profile([{ role: "zcrab" }]));
    fetchMycelium.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);

    await expect(resolveVehicleAgent("jwt")).resolves.toBe("zcrab");
  });

  it("falls back to the profile order when /tools is unreachable", async () => {
    myceliumRpc.mockResolvedValue(profile([{ role: "zcrab" }]));
    fetchMycelium.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(resolveVehicleAgent("jwt")).resolves.toBe("zcrab");
  });

  it("falls back to alpha when the caller holds only management grants", async () => {
    myceliumRpc.mockResolvedValue(profile([{ role: "tenant-owner", sysAcc: true }]));

    await expect(resolveVehicleAgent("jwt")).resolves.toBe("alpha");
    // No point asking the catalog when there is no candidate to check it against.
    expect(fetchMycelium).not.toHaveBeenCalled();
  });

  it("falls back to alpha when the profile call fails", async () => {
    myceliumRpc.mockResolvedValue({ ok: false, status: 502, message: "nope" });
    await expect(resolveVehicleAgent("jwt")).resolves.toBe("alpha");
  });
});
