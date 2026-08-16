import { fetchMycelium, myceliumRpc } from "@/lib/mycelium";

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
// Nothing needs to be configured, because both halves of "a real agent this
// caller may use" are readable at runtime:
//
//   MAY USE   -- the caller's own profile. In this stack a guest role's NAME *is*
//                the agent key (mycelium declares `protectedByRoles = [{ name =
//                "<agent>" }]` per service), so the roles in licensedResources are
//                the services this caller is licensed for. Picking from there
//                makes the choice authorized by construction.
//
//   IS REAL   -- the gateway's own catalog at GET /tools. `Tool.name` is
//                documented upstream as the name "used to identify the service
//                and call it from the gateway url path" -- literally this
//                segment. The endpoint is public (`security(())`), so asking it
//                costs no privilege and cannot deadlock: every proxy route lives
//                under /v1/*, reachable only through a service segment, so asking
//                crab-shell-proxy for its own agent list would be circular.
//
// Management grants are dropped before the intersection even runs. A member who
// also administers something holds `subscriptions-manager` / `tenant-manager` /
// `tenant-owner`, and those name no downstream service. They are excluded by
// mycelium's own marker rather than by a list of names we would have to chase: a
// management grant sits on a SYSTEM account, `sysAcc: true` ("System accounts has
// permissions to act as special users into the Mycelium system",
// core/src/domain/dtos/profile/licensed_resources.rs), which mycelium itself
// selects with `with_system_accounts_access()`.

const FALLBACK = "alpha";

interface LicensedResource {
  role?: string;
  // True for management grants; those are never routable agents.
  sysAcc?: boolean;
}

export interface ProfileResult {
  licensedResources?: { records?: LicensedResource[] } | { urls?: string[] };
}

// Every role this caller holds that could name an agent, in profile order and
// without the management grants. Kept separate from the catalog check so the two
// reasons a role can be rejected stay distinguishable.
export function candidateRoles(profile: ProfileResult | null | undefined): string[] {
  const lr = profile?.licensedResources;
  if (!lr) return [];
  const out: string[] = [];

  if ("records" in lr && Array.isArray(lr.records)) {
    for (const record of lr.records) {
      if (record?.sysAcc === true) continue;
      const role = typeof record?.role === "string" ? record.role.trim() : "";
      if (role && !out.includes(role)) out.push(role);
    }
  }

  // Compact form, byte-matching the Rust/Go `LicensedResource::to_string`:
  //   t/<tenantHex>/a/<accHex>/r/<roleHex>?p=<role>:<permInt>&s=<0|1>&v=<0|1>&n=<b64>
  // `p` carries the role up to the colon, and `s` is the same sysAcc flag.
  if ("urls" in lr && Array.isArray(lr.urls)) {
    for (const url of lr.urls) {
      if (typeof url !== "string") continue;
      if (/[?&]s=1(&|$)/.test(url)) continue;
      const raw = /[?&]p=([^:&]+)/.exec(url)?.[1];
      if (!raw) continue;
      const role = decodeURIComponent(raw);
      if (role && !out.includes(role)) out.push(role);
    }
  }

  return out;
}

// The service names the gateway will actually route. `tools` and `contexts` are
// the same Tool shape split by `isContextApi`; both are routable, so both count.
export function serviceNames(payload: unknown): Set<string> {
  const names = new Set<string>();
  for (const key of ["tools", "contexts"] as const) {
    const list = (payload as Record<string, unknown> | null)?.[key];
    if (!Array.isArray(list)) continue;
    for (const tool of list) {
      const name = (tool as { name?: unknown })?.name;
      if (typeof name === "string" && name.trim()) names.add(name.trim());
    }
  }
  return names;
}

// An empty set means "could not tell", never "no services exist" -- a 204, an
// older gateway without /tools, or a deployment that left `discoverable = false`
// all land here, and none of them should veto a role the profile vouched for.
async function fetchServiceNames(): Promise<Set<string>> {
  try {
    const res = await fetchMycelium("/tools", { cache: "no-store" });
    if (!res.ok || res.status === 204) return new Set();
    return serviceNames(await res.json());
  } catch {
    return new Set();
  }
}

export async function resolveVehicleAgent(token: string): Promise<string> {
  const rpc = await myceliumRpc<ProfileResult>(
    "beginners.profile.get",
    // Asks for the RECORDS variant of licensedResources; candidateRoles accepts
    // the compact-url variant too, so a gateway that ignores the flag still works.
    { withUrl: false },
    token,
  );
  if (!rpc.ok) return FALLBACK;

  const roles = candidateRoles(rpc.result);
  if (roles.length === 0) return FALLBACK;

  const declared = await fetchServiceNames();
  // Prefer a role the gateway confirms it routes. When the catalog is empty we
  // could not tell, so the profile alone decides -- still strictly better than
  // the constant this replaced.
  return roles.find((role) => declared.has(role)) ?? roles[0];
}
