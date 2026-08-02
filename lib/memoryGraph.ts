import type { Workspace } from "@/app/chat/fragment";
import { errorCode } from "@/lib/i18n/errors";

// Client wrapper for the agent's knowledge-graph memory — the entities,
// relations and observations the bot accumulates through its native MCP server.
// Read-only: the agent writes, the member inspects.
//
// Distinct from lib/memory.ts, which is MEMORY_CUSTOM.md — a flat document the
// member writes for the agent. Two different memories; the labels in the UI say
// so, and these two modules deliberately share nothing.

/** Epoch MILLISECONDS, matching the Go store (and upstream's Date.now()). */
export type EpochMillis = number;

export interface Observation {
  content: string;
  timestamp: EpochMillis;
  /** Absent, not zero, when the record never carried one — the Go field is omitempty. */
  confidence?: number;
  /**
   * The conversation this fact came out of, when the proxy could attribute it.
   *
   * ABSENT IS NORMAL, not a defect. The proxy attributes a write only when exactly
   * one turn is in flight for the workspace; a cron job, the heartbeat, post-turn
   * evolution and two concurrent conversations all yield nothing, as does every fact
   * stored before provenance existed. A UI that renders an empty source list as an
   * error reads as broken on legitimate data.
   */
  sourceSessionId?: string;
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
  createdAt?: EpochMillis;
  /** See Observation.sourceSessionId — absent is normal. */
  sourceSessionId?: string;
}

/**
 * An entity in FULL detail, from open_nodes / read_graph?detail_level=full.
 *
 * Note `entityType`. The summary and minimal projections call the same thing
 * `type` — see SummaryEntity. They are separate types here precisely because a
 * component that reads `entityType` off a summary row renders blank for every
 * row and still compiles.
 */
export interface Entity {
  name: string;
  entityType: string;
  observations: Observation[];
  createdAt?: EpochMillis;
  archived?: boolean;
  merged?: boolean;
  mergedInto?: string;
  mergedAt?: EpochMillis;
  /** See Observation.sourceSessionId — absent is normal. */
  sourceSessionId?: string;
}

/** A browse row from read_graph's default "summary" projection. */
export interface SummaryEntity {
  name: string;
  /** NOT `entityType` — see Entity. */
  type: string;
  observationCount: number;
  /** Absent when the entity has no observations yet. */
  firstObservation?: string;
  relationCount: number;
}

export interface SummaryGraph {
  entities: SummaryEntity[];
  relations: Relation[];
  totalObservations: number;
}

export interface FullGraph {
  entities: Entity[];
  relations: Relation[];
}

/**
 * One ranked hit. `entity_name` is snake_case inside an otherwise camelCase
 * envelope — that asymmetry is deliberate fidelity to the upstream project the
 * proxy's tools were ported from, not a mistake to normalise away.
 */
export interface SearchHit {
  entity_name: string;
  score: number;
}

export interface SearchResult extends FullGraph {
  searchResults: SearchHit[];
  /** Always "lexical": the ranking is BM25, not embeddings. */
  searchType: string;
}

export interface EntityObservations {
  entity: string;
  observations: Observation[];
}

export interface RecentChanges {
  recentEntities: Entity[];
  recentRelations: Relation[];
  recentObservations: EntityObservations[];
}

function workspaceQuery(
  workspace: Workspace,
  extra: Record<string, string> = {},
): string {
  return new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...extra,
  }).toString();
}

async function get<T>(path: string, query: string): Promise<T> {
  const res = await fetch(`${path}?${query}`);
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as T;
}

/** The browse list: names, types, counts and each entity's first observation. */
export function readGraph(
  workspace: Workspace,
  opts: { includeArchived?: boolean; includeMerged?: boolean } = {},
): Promise<SummaryGraph> {
  const extra: Record<string, string> = { detail_level: "summary" };
  if (opts.includeArchived) extra.include_archived = "true";
  if (opts.includeMerged) extra.include_merged = "true";
  return get<SummaryGraph>(
    "/api/memory-graph",
    workspaceQuery(workspace, extra),
  );
}

/**
 * Full detail for named entities. This is the only read that shows archived and
 * merged entities without asking — naming an entity is how you inspect one the
 * agent has retired.
 */
export function openNodes(
  workspace: Workspace,
  names: string[],
): Promise<FullGraph> {
  return get<FullGraph>(
    "/api/memory-graph/nodes",
    workspaceQuery(workspace, { names: names.join(",") }),
  );
}

export function searchGraph(
  workspace: Workspace,
  query: string,
  k = 10,
): Promise<SearchResult> {
  return get<SearchResult>(
    "/api/memory-graph/search",
    workspaceQuery(workspace, { query, k: String(k) }),
  );
}

export function recentChanges(
  workspace: Workspace,
  hours = 24,
): Promise<RecentChanges> {
  return get<RecentChanges>(
    "/api/memory-graph/recent",
    workspaceQuery(workspace, { hours: String(hours) }),
  );
}

/**
 * The edges touching one entity, in either direction.
 *
 * Exported and pure because of a bug it exists to prevent: `openNodes` filters
 * relations to those with BOTH endpoints among the names requested, so asking for
 * a single entity returns its observations and an EMPTY relation list, every
 * time. A detail pane that trusted that response would show "no relations" for a
 * densely connected entity and look correct doing it.
 *
 * The browse and search responses already carry the relations among everything
 * they returned, so the caller filters those instead.
 */
export function relationsFor(relations: Relation[], name: string): Relation[] {
  return relations.filter((r) => r.from === name || r.to === name);
}

/**
 * The distinct conversations that contributed to an entity, most recent first.
 *
 * Ordered by the newest observation each one produced, so the chat a member most
 * likely wants is at the top. The entity's own `sourceSessionId` (the conversation
 * that created it) is included, ranked by the entity's creation time.
 *
 * Exported and pure so it can be tested without rendering: an entity built up over
 * months has many observations and a handful of sources, and getting the dedup or the
 * ordering wrong is invisible in a screenshot.
 */
export function entitySources(
  entity: Entity,
): { sessionId: string; at: EpochMillis }[] {
  const newest = new Map<string, EpochMillis>();
  const consider = (id: string | undefined, at: EpochMillis | undefined) => {
    if (!id) return;
    const prev = newest.get(id);
    const when = at ?? 0;
    if (prev === undefined || when > prev) newest.set(id, when);
  };
  consider(entity.sourceSessionId, entity.createdAt);
  for (const o of entity.observations) consider(o.sourceSessionId, o.timestamp);
  return [...newest.entries()]
    .map(([sessionId, at]) => ({ sessionId, at }))
    .sort((a, b) => b.at - a.at);
}

/**
 * The entity types present in a graph, with how many entities carry each, most common
 * first and ties broken alphabetically so the chip row is stable between reads.
 *
 * `entityType` is the flat axis a member can organise by without any new concept — and
 * because it is ONE value per entity, it partitions the graph cleanly. Themes that need
 * to overlap are modelled as entities with relations instead; this is for "show me only
 * the people" / "only the themes".
 *
 * Pure and exported: the ordering is a product decision and the counts are easy to get
 * wrong when the same type appears in many entities.
 */
export function entityTypeCounts(
  entities: { type: string }[],
): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entities) {
    if (!e.type) continue;
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
