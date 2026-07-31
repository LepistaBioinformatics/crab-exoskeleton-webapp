import type { ScopeRef } from "@/lib/admin";
import {
  CONFIG_OUTCOMES,
  type ConfigKeyBucket,
  type InstanceOutcome,
  type Outcome,
  type ScopeConfigInspection,
  type ScopeConfigResult,
  type TemplateCatalog,
} from "@/lib/scopeConfig";

// The bulk-config panel's decisions, kept out of the component so every one of
// them is testable without a DOM (this suite runs `environment: "node"`), the way
// instance-config-state.ts does it for the single-instance editor.
//
// Config values are `unknown` here, not JsonValue: lib/scopeConfig.ts types them
// that way on purpose -- they are arbitrary JSON from an admin's config.json, and
// this layer must not coerce them.

// What the value field's text amounts to. One result rather than a value plus a
// separate error, so "parsed to null" can never be confused with "did not parse".
export type ParsedValue =
  | { ok: true; value: unknown }
  // A code, not a sentence, and not V8's parser message: the panel maps it to
  // copy, and the actionable thing to say about a bare word ("quote it") is not
  // something V8's "Unexpected token 'h'" can express. Same shape as
  // parseDocument's `notObject` in json-tree.ts.
  | { ok: false; error: "required" | "invalidJson" };

// parseValueInput reads the field as JSON, which is the whole point: the admin is
// typing a config VALUE, so `true` must mean the boolean and `42` the number.
//
// That cuts both ways, and the bare word is the case worth naming. `hello` is
// rejected instead of being read as the string "hello", because an input where
// `true` is a boolean and `hello` is a string is inconsistent -- the admin would
// have no way to ask for the string "true". Being told to quote it is the fix.
//
// parseDocument is not reused: it also requires an object at the top level, and
// every scalar here is a legal value.
export function parseValueInput(text: string): ParsedValue {
  // Empty is its own refusal. There is no "clear this key" request on this
  // endpoint -- an absent value is not something an apply can express -- so a
  // blank field is a missing input, never an instruction.
  if (text.trim() === "") return { ok: false, error: "required" };
  try {
    // null lands here as a value, which is what it is: the proxy buckets a JSON
    // null under state "value", and "set to null" has to stay distinct from
    // "holds nothing".
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "invalidJson" };
  }
}

// canonicalJson serializes with object keys sorted at every depth.
//
// JSON.stringify alone preserves insertion order, so two instances holding the
// same object would compare as different values purely because the proxy read
// their keys in another order -- and the panel would offer to "change" a workspace
// that already holds exactly what the admin is submitting.
//
// Arrays keep their order: in an array, position is meaning.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

// isManagedKey reports whether the TEMPLATE marks this key as proxy-owned.
//
// It exists because the key picker became a datalist, and a datalist option cannot
// be disabled the way the <select> option it replaced could. Without this the guard
// would be gone and the admin would learn only from the proxy's 400.
//
// It is deliberately NOT a reimplementation of the proxy's rule. The proxy refuses
// three relations to ManagedConfigPaths — equal, under, and prefix-of — and stays
// the authority. This answers the narrower question the catalog can actually
// answer: "is this exact key one the template already told us is owned?" A key the
// catalog has never heard of is not flagged, because a hand-typed path the template
// lacks is legitimate and guessing here would block valid keys.
export function isManagedKey(catalog: TemplateCatalog | null, key: string): boolean {
  if (!catalog) return false;
  const wanted = key.trim();
  return catalog.keys.some((k) => k.key === wanted && k.managed);
}

// prettyJson is the same value, indented for a human.
//
// It exists BESIDE canonicalJson rather than replacing it because the two have
// different jobs, and merging them would break the one that matters: the compact
// form is the bucket KEY and the equality test behind set-if-different, so it has
// to stay byte-stable. This one is display only. They sort keys identically, so
// what a bucket shows is always the value the bucket was keyed by.
export function prettyJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) out[key] = sortKeys(src[key]);
  return out;
}

export interface PreviewCounts {
  willChange: number;
  alreadyMatch: number;
  excluded: number;
}

// previewCounts says what an apply would do, before it is sent.
//
// It counts INSTANCES via bucket.count, not buckets: the view is a histogram, one
// bucket can hold many workspaces, and the count that has to reconcile with
// inspection.total is the instance count. The three categories are exhaustive over
// the four bucket states, so they always sum to total -- that is the property
// making the preview trustworthy.
//
// bucket.count is used here while revisionsFor walks bucket.instances, because
// each is the field that answers its own question (total pairs with count; ids
// only exist on instances). lib/scopeConfig.ts parses them independently and is
// already this feature's defensive boundary, so nothing reconciles them twice.
export function previewCounts(
  inspection: ScopeConfigInspection,
  newValue: unknown,
): PreviewCounts {
  const target = canonicalJson(newValue);
  const counts: PreviewCounts = { willChange: 0, alreadyMatch: 0, excluded: 0 };
  for (const bucket of inspection.buckets) {
    if (bucket.state === "value") {
      if (canonicalJson(bucket.value) === target) counts.alreadyMatch += bucket.count;
      else counts.willChange += bucket.count;
    } else if (bucket.state === "absent") {
      // Writable, and the write creates the key -- a change, not a no-op.
      counts.willChange += bucket.count;
    } else {
      // path_conflict and unreadable. Neither can be written: one has a non-object
      // sitting where the key's parent must be, the other could not be read at all.
      counts.excluded += bucket.count;
    }
  }
  return counts;
}

// revisionsFor gathers the concurrency tokens the apply gates on, keyed by
// workspace. An instance missing from this map is treated as `stale` by the proxy
// and never written, so this map IS the set of instances the apply addresses.
//
// unreadable and path_conflict are both left out, and path_conflict is the
// interesting one: previewCounts calls it excluded, so sending it anyway would
// have the preview promise "untouched" while the result reported an attempt that
// failed. Leaving it out keeps those two views telling the same story.
export function revisionsFor(inspection: ScopeConfigInspection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const bucket of inspection.buckets) {
    if (bucket.state !== "value" && bucket.state !== "absent") continue;
    for (const instance of bucket.instances) out[instance.userAccId] = instance.revision;
  }
  return out;
}

// displayBuckets is the render order, and it deliberately does no sorting: the
// proxy already orders the buckets deterministically, and re-sorting here would
// let the panel's order drift from the order every other reader of the same
// response sees.
//
// The copy exists so a render-time sort cannot mutate the loaded inspection --
// Array.prototype.sort is in place, and the inspection is also what revisionsFor
// reads.
export function displayBuckets(inspection: ScopeConfigInspection): ConfigKeyBucket[] {
  return inspection.buckets.slice();
}

export interface OutcomeGroup {
  kind: Outcome;
  instances: InstanceOutcome[];
}

export interface GroupedOutcomes {
  groups: OutcomeGroup[];
  /**
   * Drives a re-inspect prompt rather than a retry button. A stale revision means
   * the proxy's own materialization wrote the file after the admin inspected it,
   * so re-sending the same revisions would overwrite that write -- the admin has
   * to look at the new values first.
   */
  hasStale: boolean;
}

// groupOutcomes buckets the apply's per-instance outcomes for rendering, in
// CONFIG_OUTCOMES' declaration order so the sections never reorder between two
// applies of the same key. Kinds nothing landed on are dropped: an empty section
// reads as a claim about zero instances.
//
// hasStale comes from the outcomes, not result.summary: the summary is a loose
// string->number map the proxy may omit, and this flag gates what the panel tells
// the admin to do next.
export function groupOutcomes(result: ScopeConfigResult): GroupedOutcomes {
  const groups: OutcomeGroup[] = [];
  for (const kind of CONFIG_OUTCOMES) {
    const instances = result.outcomes.filter((o) => o.outcome === kind);
    if (instances.length > 0) groups.push({ kind, instances });
  }
  return { groups, hasStale: result.outcomes.some((o) => o.outcome === "stale") };
}

// inspectionKey is the identity an inspection belongs to. The panel drops a loaded
// inspection when this changes, which is what stops a revisions map gathered under
// one scope, agent or key from being submitted against another -- that would write
// revisions the admin never inspected, against workspaces they never saw.
//
// `agent` is the argument, not scope.agent: bulkParams ignores scope.agent and
// takes the agent explicitly, so the agent in the request is the one here.
//
// JSON.stringify of the tuple rather than a joined string: joining raw fields lets
// one component's text impersonate a separator and collide with a different
// identity.
export function inspectionKey(scope: ScopeRef, agent: string, key: string): string {
  return JSON.stringify([scope.kind, scope.tenantId, scope.subsAccId ?? null, agent, key]);
}
