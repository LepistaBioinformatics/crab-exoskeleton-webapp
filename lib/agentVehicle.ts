import { myceliumRpc } from "@/lib/mycelium";

// Server-side only.
//
// Two routes are agent-AGNOSTIC in what they do but still have to travel through
// an agent: workspace discovery (/v1/subscriptions) and every /v1/admin/* call.
// Mycelium routes on the FIRST PATH SEGMENT, which is a declared service, and
// crab-shell-proxy's resolveAgent then matches that service to a configured agent
// and checks the bearer mycelium injected for it. So the segment has to name a
// real, reachable agent -- it just does not matter WHICH one.
//
// That segment used to be the literal "alpha". It worked only because every
// deployment happened to have an agent by that name. Rename the agents -- which a
// deployment does simply by declaring its own services -- and both routes answer
// `{"error":"Request path does not match any service","status":400}`, with the
// admin panel and workspace discovery dead while chat keeps working.
//
// The name is resolvable at runtime, so nothing needs to be configured. In this
// stack a guest role's NAME *is* the agent key (mycelium's config declares
// `protectedByRoles = [{ name = "<agent>" }]` per service), which means the
// caller's own profile already lists exactly the agents they may route through.
// Reading the role from there also makes the choice authorized by construction:
// we can only pick a service this caller is licensed for.

const FALLBACK = "alpha";

interface LicensedResource {
  role?: string;
}

interface ProfileResult {
  licensedResources?: { records?: LicensedResource[] } | { urls?: string[] };
}

// `withUrl: false` asks for the RECORDS variant of licensedResources. The other
// variant is a list of compact URL strings (`t/<hex>/a/<hex>/r/<hex>?p=<role>:<n>…`)
// that also carries the role, but parsing it to reach a field we can request
// directly would be work for nothing. Both shapes are accepted below anyway, so a
// gateway that ignores the flag does not break this.
export async function resolveVehicleAgent(token: string): Promise<string> {
  const rpc = await myceliumRpc<ProfileResult>(
    "beginners.profile.get",
    { withUrl: false },
    token,
  );
  if (!rpc.ok) return FALLBACK;
  return pickVehicle(rpc.result) ?? FALLBACK;
}

// Exported for tests, and kept pure: everything that can vary about the wire
// shape is decided here rather than inside the fetch.
export function pickVehicle(profile: ProfileResult | null | undefined): string | null {
  const lr = profile?.licensedResources;
  if (!lr) return null;

  if ("records" in lr && Array.isArray(lr.records)) {
    for (const record of lr.records) {
      const role = typeof record?.role === "string" ? record.role.trim() : "";
      if (role) return role;
    }
  }

  // Compact form: t/<tenantHex>/a/<accHex>/r/<roleHex>?p=<role>:<permInt>&…
  // The role is the `p` query param, up to the colon.
  if ("urls" in lr && Array.isArray(lr.urls)) {
    for (const url of lr.urls) {
      if (typeof url !== "string") continue;
      const role = /[?&]p=([^:&]+)/.exec(url)?.[1];
      if (role) return decodeURIComponent(role);
    }
  }

  return null;
}
