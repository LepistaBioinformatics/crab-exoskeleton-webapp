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
import type { Entity, Relation } from "@/lib/memoryGraph";

export type MangroveReading = "received" | "published" | "pending";

/**
 * One shared memory, whatever kind it is.
 *
 * THREE KINDS ARRIVE THROUGH THE SAME FIELDS, and which one this is has to be read
 * off the object rather than asked for: prose carries `content`; a file carries
 * `blob` (its sha-256) with `fileName` and `size` and no content at all; a graph
 * fragment carries `content` that is JSON, labelled with
 * GRAPH_FRAGMENT_MEDIA_TYPE. A reader that only looks at `content` shows a file as
 * an empty memory and a fragment as a wall of braces.
 */
export interface MangroveObject {
  id: string;
  type: string;
  cell: string;
  content?: string;
  mediaType?: string;
  /** sha-256, hex. Present only for a file, and the handle the blob route takes. */
  blob?: string;
  /** What the sender called the file. Absent means fall back to the digest. */
  fileName?: string;
  /** The file's size in bytes. */
  size?: number;
}

/** The media type a graph fragment is labelled with. */
export const GRAPH_FRAGMENT_MEDIA_TYPE = "application/vnd.mangrove.graph+json";

/**
 * A fragment's decoded body: entities and the relations among them, in exactly the
 * shape `lib/memoryGraph.ts` already speaks.
 */
export interface GraphFragment {
  entities: Entity[];
  relations: Relation[];
}

/**
 * A fragment's body, or null when it is not one.
 *
 * NEVER THROWS. The JSON was written by another tenant's agent and travelled through
 * a network this deployment does not own, so a body that is truncated, empty or not
 * an object at all is an ordinary thing to receive — and the caller has a perfectly
 * good answer for null, which is to render it as the text it turned out to be.
 */
export function parseGraphFragment(object: MangroveObject): GraphFragment | null {
  if (object.mediaType !== GRAPH_FRAGMENT_MEDIA_TYPE) return null;
  if (!object.content) return null;
  try {
    const parsed = JSON.parse(object.content) as Partial<GraphFragment>;
    if (!Array.isArray(parsed?.entities)) return null;
    return {
      entities: parsed.entities,
      // Relations are optional in practice: one entity extracted on its own has none.
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
    };
  } catch {
    return null;
  }
}

/** One author's current position on one cell. */
export interface MangroveClaim {
  cell: string;
  author: string;
  object: MangroveObject;
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
  object: MangroveObject;
  published: string;
}

/** A cross-scope publication waiting on a governing role. */
export interface MangrovePending {
  activityId: string;
  author: string;
  scope: string;
  object: MangroveObject;
  published: string;
}

export interface MangroveTimeline {
  reading: MangroveReading;
  claims?: MangroveClaim[];
  held?: MangroveHeld[];
  pending?: MangrovePending[];
}

/** Milliseconds, or 0 for a timestamp another deployment's mangrove wrote badly. */
function at(published: string): number {
  const ms = Date.parse(published);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * A reading's items, most recent first.
 *
 * SORTED HERE, not left to the order the answer happened to arrive in. `claims` is a
 * reduction keyed by (cell, author), so its order is the order the keys were first
 * seen — which is close enough to chronological, often enough, that a list nobody
 * sorted looks sorted right up until the day it does not. A copy rather than a sort
 * in place: the array belongs to the timeline the hook is holding.
 */
export function newestFirst<T extends { published: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => at(b.published) - at(a.published));
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

/**
 * The same query plus the project, for the calls that resolve something the
 * project OWNS.
 *
 * Reading the mangrove does not take it: the network is per subscription, and a
 * timeline is the same timeline whichever project the member is looking at. But
 * a file path and an entity name are resolved against a workspace, and each
 * project is a separate one -- so publishing a file or a fragment, and merging a
 * fragment back, have to say which. Without it the proxy would resolve the name
 * against the MAIN workspace: a 404, or silently the wrong file of the same name.
 */
function projectExtra(w: Workspace): Record<string, string> {
  return w.p ? { project: w.p } : {};
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

/** How a body is meant to be read. The mangrove takes these two and no others. */
export type MangroveMediaType = "text/markdown" | "text/plain";

/**
 * Somebody addressed by email, and which of their two actors it reaches.
 *
 * THE ONLY FORM THAT WORKS IN BOTH DIRECTORY MODES. A strict-mode search
 * returns no actor id at all -- only confirmation that the address is
 * reachable -- so an id is something the sender may not have, and addressing
 * built on one would silently stop working wherever an administrator had not
 * opened search up.
 */
export interface MangroveEmailTarget {
  email: string;
  /** Reaches them, to admit or ignore. */
  person: boolean;
  /** Reaches their agent's memory. */
  agent: boolean;
}

/** Who a publication reaches. The same two fields whatever is being published. */
export interface MangroveAudience {
  /** Actor and group ids addressed directly. May be empty. */
  to: string[];
  /** Addressing by email. May be empty. */
  toEmails: MangroveEmailTarget[];
}

/**
 * EXACTLY ONE OF THREE CONTENTS, and the union is what says so before the request
 * is built.
 *
 * The mangrove refuses zero and refuses two, with one sentence for both -- which is
 * a 400 the member discovers after writing something and pressing Share. A union
 * makes the second half unrepresentable here instead: the `?: never` fields are
 * what stop an object literal carrying a body AND a file, since TypeScript's excess
 * property check otherwise allows any key that exists in ANY member of a union.
 */
export interface MangroveProse extends MangroveAudience {
  cell: string;
  content: string;
  mediaType: MangroveMediaType;
  file?: never;
  entities?: never;
}

/**
 * A file out of the member's own workspace, named by the path the files tab holds.
 *
 * THE BROWSER UPLOADS NOTHING. The proxy reads the file itself and streams it into
 * the mangrove, so what travels from here is the path and nothing else -- and the
 * cell is the proxy's to derive, which is why there is no room for one.
 */
export interface MangroveFilePublication extends MangroveAudience {
  file: string;
  cell?: never;
  content?: never;
  mediaType?: never;
  entities?: never;
}

/**
 * Entities out of the agent's knowledge graph, by name.
 *
 * The proxy extracts those entities AND the relations among them, so sharing two
 * names that are linked shares the link. The cell is derived, as it is for a file.
 */
export interface MangroveEntitiesPublication extends MangroveAudience {
  entities: string[];
  cell?: never;
  content?: never;
  mediaType?: never;
  file?: never;
}

export type MangrovePublication =
  | MangroveProse
  | MangroveFilePublication
  | MangroveEntitiesPublication;

export interface MangrovePublished {
  activity: unknown;
  /** Cross-scope: nothing is delivered until a governing role decides it. */
  pending: boolean;
}

/** The group every member of this subscription reads. */
export function subscriptionGroupId(w: Workspace): string {
  return `mangrove:group:subscription:${w.s}`;
}

/** The group the whole tenant reads. Licensed, and never an agent's to address. */
export function tenantGroupId(w: Workspace): string {
  return `mangrove:group:tenant:${w.t}`;
}

/**
 * Publish a memory as yourself.
 *
 * AN EMPTY AUDIENCE IS NOT AN OMISSION. Both lists empty publishes privately to
 * the author -- a note kept in your own agent's memory and shared with nobody --
 * which is a thing a member means to do, so the form does not insist on a
 * recipient before it will send.
 *
 * A refusal keeps the mangrove's own words: it names the addressee that was out
 * of reach, and `MangroveError.code` carries that sentence rather than a code
 * this client invented. Showing a generic failure instead would leave the
 * sender with nothing to fix.
 */
export function publish(w: Workspace, publication: MangrovePublication): Promise<MangrovePublished> {
  return call<MangrovePublished>(
    "publish",
    w,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publication),
    },
    projectExtra(w),
  );
}


/**
 * What a merge put into the member's own graph.
 *
 * Three counts, and all three can be zero: merging a fragment whose every entity
 * and observation is already known lands nothing. That is a real outcome and the
 * screen says so, rather than reporting success over an empty result.
 */
export interface MangroveMerge {
  entitiesCreated: number;
  observationsAdded: number;
  relationsCreated: number;
}

/** Take a graph fragment into this member's own agent's memory. */
export function mergeFragment(w: Workspace, objectId: string): Promise<MangroveMerge> {
  return call<MangroveMerge>(
    "merge",
    w,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectId }),
    },
    projectExtra(w),
  );
}

/**
 * Where a published file's bytes are.
 *
 * Its own BFF route rather than the action one every call above goes through: that
 * route parses JSON and re-serializes it, and these bytes are not JSON. The same
 * split `/api/media/download` already makes, for the same reason.
 */
export function blobUrl(w: Workspace, blob: string): string {
  const query = workspaceQuery(w);
  query.set("blob", blob);
  return `/api/mangrove/blob?${query}`;
}

/**
 * Save a published file to disk.
 *
 * Fetch-then-anchor rather than navigating at the URL, exactly as `downloadMedia`
 * does: a navigation would put the download in session history and would lose the
 * failure, and a failure here is something the screen has to be able to say.
 */
export async function downloadBlob(w: Workspace, blob: string, fileName?: string): Promise<void> {
  const res = await fetch(blobUrl(w, blob));
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") code = body.error;
    } catch {
      // Not JSON: the status is all there is to report.
    }
    throw new MangroveError(code);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  // The digest is a usable name when the sender gave none -- an empty `download`
  // would let the browser invent one from the URL, which is the route path.
  a.download = fileName || blob;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
