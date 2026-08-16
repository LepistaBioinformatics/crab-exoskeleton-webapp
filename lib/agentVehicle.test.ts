import { afterEach, describe, expect, it, vi } from "vitest";
import { pickVehicle, resolveVehicleAgent } from "./agentVehicle";

const myceliumRpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mycelium", () => ({ myceliumRpc }));

afterEach(() => vi.clearAllMocks());

describe("pickVehicle", () => {
  it("takes the role from the records variant", () => {
    expect(
      pickVehicle({ licensedResources: { records: [{ role: "zcrab" }] } }),
    ).toBe("zcrab");
  });

  it("skips records whose role is empty or whitespace", () => {
    // A grant we cannot name cannot be routed through; the next one still can.
    expect(
      pickVehicle({
        licensedResources: { records: [{ role: "" }, { role: "  " }, { role: "beta" }] },
      }),
    ).toBe("beta");
  });

  it("reads the role out of the compact url variant", () => {
    // t/<tenantHex>/a/<accHex>/r/<roleHex>?p=<role>:<permInt>&s=0&v=1&n=<b64>
    expect(
      pickVehicle({
        licensedResources: {
          urls: ["t/aa/a/bb/r/cc?p=eva-natural-ai:1&s=0&v=1&n=RXZh"],
        },
      }),
    ).toBe("eva-natural-ai");
  });

  it("returns null when there is nothing to pick", () => {
    expect(pickVehicle(null)).toBeNull();
    expect(pickVehicle({})).toBeNull();
    expect(pickVehicle({ licensedResources: { records: [] } })).toBeNull();
    expect(pickVehicle({ licensedResources: { urls: [] } })).toBeNull();
  });
});

describe("resolveVehicleAgent", () => {
  it("asks for the records variant and returns the caller's role", async () => {
    myceliumRpc.mockResolvedValue({
      ok: true,
      result: { licensedResources: { records: [{ role: "zcrab" }] } },
    });

    await expect(resolveVehicleAgent("jwt")).resolves.toBe("zcrab");
    expect(myceliumRpc).toHaveBeenCalledWith(
      "beginners.profile.get",
      { withUrl: false },
      "jwt",
    );
  });

  it("falls back to alpha when the profile carries no roles", async () => {
    // Today's behaviour for a caller with no guest grant -- a staff account that
    // was never invited into a subscription. Keeping the old constant here means
    // this change can only ever improve on what a deployment had.
    myceliumRpc.mockResolvedValue({ ok: true, result: { licensedResources: { records: [] } } });
    await expect(resolveVehicleAgent("jwt")).resolves.toBe("alpha");
  });

  it("falls back to alpha when the profile call fails", async () => {
    myceliumRpc.mockResolvedValue({ ok: false, status: 502, message: "nope" });
    await expect(resolveVehicleAgent("jwt")).resolves.toBe("alpha");
  });
});
