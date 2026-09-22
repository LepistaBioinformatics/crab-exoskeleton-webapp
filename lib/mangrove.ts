// The mangrove: memory this member's agent shared, and memory others shared with
// them. EXPERIMENTAL — see crab-mangrove-network's README.
//
// THREE ANSWERS THAT MUST NOT COLLAPSE INTO ONE. A reading can come back empty,
// the service can be unreachable, or the whole feature can be switched off in
// this deployment. They look similar from here and mean entirely different
// things to a member: "nobody has shared anything yet", "it is broken right
// now", and "your operator never turned this on". The first is a normal state
// and must never be dressed as a failure; the third means the tab should not be
// there at all.
//
// `mangrove_off` is how the last one arrives: the proxy does not register the
// routes when the mangrove is unconfigured, so the BFF sees a 404 and says so. That
// is the same shape `projects_unsupported` already uses to hide a feature a
// harness predates, and for the same reason — an affordance that renders and
// then refuses teaches the wrong thing.

import type { Workspace } from "@/app/chat/fragment";

export type MangroveReading = "received" | "published" | "pending";

/** One author's current position on one cell. */
export interface MangroveClaim {
  cell: string;
  author: string;
  object: { id: string; type: string; cell: string; content?: string; mediaType?: string };
  published: string;
  deleted: boolean;
  /** Distinct actors who endorsed this. Weight of evidence, never a verdict. */
  evidence: number;
  audience: string[];
}

/** Addressed at this member, and NOT yet in their agent's memory. */
export interface MangroveHeld {
  activityId: string;
  from: string;
  object: { id: string; type: string; cell: string; content?: string };
  published: string;
}

/** A cross-scope publication waiting on a governing role. */
export interface MangrovePending {
  activityId: string;
  author: string;
  scope: string;
  object: { id: string; type: string; cell: string; content?: string };
  published: string;
}

export interface MangroveTimeline {
  reading: MangroveReading;
  claims?: MangroveClaim[];
  held?: MangroveHeld[];
  pending?: MangrovePending[];
}

/** One person the directory found. */
export interface DirectoryEntry {
  email: string;
  /** Absent in strict mode -- address them by email instead. */
  actorId?: string;
}

export interface DirectoryResult {
  /** Which question this deployment's directory is able to answer. */
  mode: "exact" | "prefix";
  results: DirectoryEntry[];
}

/** Your own handles, to give to somebody whose deployment cannot search. */
export interface MangroveIdentity {
  email: string;
  personId: string;
  serviceId: string;
}

export interface MangroveCapabilities {
  /** May decide cross-scope publications into this subscription. */
  governs: boolean;
  /** May address the whole tenant. Never true for an agent. */
  tenantLicensed: boolean;
}

export class MangroveError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function workspaceQuery(w: Workspace): URLSearchParams {
  return new URLSearchParams({ role: w.r, tenant_id: w.t, subs_acc_id: w.s });
}

async function call<T>(
  path: string,
  w: Workspace,
  init?: RequestInit,
  extra?: Record<string, string>,
): Promise<T> {
  const query = workspaceQuery(w);
  for (const [k, v] of Object.entries(extra ?? {})) query.set(k, v);
  const res = await fetch(`/api/mangrove/${path}?${query}`, init);
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") code = body.error;
    } catch {
      // A body that is not JSON tells us nothing the status has not already.
    }
    throw new MangroveError(code);
  }
  return (await res.json()) as T;
}

export function readTimeline(w: Workspace, reading: MangroveReading): Promise<MangroveTimeline> {
  return call<MangroveTimeline>("timeline", w, undefined, { reading });
}

export function readCapabilities(w: Workspace): Promise<MangroveCapabilities> {
  return call<MangroveCapabilities>("capabilities", w);
}

/**
 * Look somebody up.
 *
 * `q` is a whole email address unless the administrator enabled prefix search,
 * which the answer's `mode` reports -- so the UI can say which question it is
 * able to answer rather than leaving the member to infer it from empty results.
 */
export function findPeople(w: Workspace, q: string): Promise<DirectoryResult> {
  return call<DirectoryResult>("directory", w, undefined, { q });
}

/** Your own ids. Always available, in either directory mode. */
export function readIdentity(w: Workspace): Promise<MangroveIdentity> {
  return call<MangroveIdentity>("identity", w);
}

/** Take something sent directly to you into your own agent's memory. */
export function admit(w: Workspace, activityId: string): Promise<unknown> {
  return call("admit", w, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId }),
  });
}

/** Accept or reject a cross-scope publication. Governing role only. */
export function decide(w: Workspace, activityId: string, accept: boolean): Promise<unknown> {
  return call("decide", w, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId, accept }),
  });
}

/**
 * Tombstone something your own agent published.
 *
 * It does NOT erase. ActivityPub cannot un-deliver, so anything already
 * delivered to another scope stays delivered — the UI says so rather than
 * implying otherwise.
 */
export function revoke(w: Workspace, objectId: string, cell: string): Promise<unknown> {
  return call("revoke", w, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectId, cell }),
  });
}
