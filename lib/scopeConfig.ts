import { errorCode } from "@/lib/i18n/errors";
import { DEFAULT_POLICY, withPolicy, type RestartPolicy } from "@/lib/restartPolicy";
import type { ScopeRef } from "@/lib/admin";

// Bulk instance-config administration (admin-bulk-instance-config): see how ONE
// dotted config.json key varies across every instance of one agent in one
// subscription, then set it everywhere it differs.
//
// The view the proxy returns is a HISTOGRAM, not a list of documents: instances
// holding the same value collapse into one bucket, and the three ways an instance
// can hold no value at all stay separate because each implies a different
// decision. These types mirror the proxy's Go structs field for field
// (internal/docker/bulk_config.go, template_config.go); every config value is
// typed `unknown` because it is arbitrary JSON and this layer must not coerce it.

export const BUCKET_STATES = ["value", "absent", "path_conflict", "unreadable"] as const;
export type BucketState = (typeof BUCKET_STATES)[number];

export const CONFIG_OUTCOMES = [
  "applied",
  "unchanged",
  "stale",
  "path_conflict",
  "unreadable",
  "error",
] as const;
export type Outcome = (typeof CONFIG_OUTCOMES)[number];

export interface TemplateKey {
  key: string;
  value: unknown;
  /**
   * Managed keys are INCLUDED and flagged, not filtered: the proxy rewrites them
   * on every materialization, so the picker renders them disabled and explains
   * why rather than leaving the admin hunting for a key that is in the file.
   */
  managed: boolean;
}

export interface TemplateCatalog {
  /**
   * The template NAME, which config.yaml declares per agent and is NOT the agent
   * key: two agents may share one template, and a write here reaches every agent
   * that does.
   */
  template: string;
  keys: TemplateKey[];
  /** Concurrency token over the template bytes as read, sent back on an apply. */
  templateRevision: string;
}

/**
 * One member's workspace inside a bucket. `revision` is that workspace's
 * on-disk config.json revision, which a later apply gates on — an instance the
 * admin never saw a revision for is one it must not write to.
 */
export interface ConfigKeyInstance {
  userAccId: string;
  email?: string;
  revision: string;
  detail?: string;
}

export interface ConfigKeyBucket {
  state: BucketState;
  /**
   * Present only when state === "value". The key's ABSENCE is the signal, so this
   * field is never set to undefined: a JSON null is a value the proxy groups here,
   * and "set to null" must stay a different fact from "holds nothing".
   */
  value?: unknown;
  count: number;
  instances: ConfigKeyInstance[];
}

export interface ScopeConfigInspection {
  key: string;
  agent: string;
  total: number;
  buckets: ConfigKeyBucket[];
  // There is deliberately no template field: the catalog already carries a value
  // for every key, so the panel has it before it ever inspects.
}

export interface ScopeConfigChangeBody {
  key: string;
  /** Verbatim JSON: true and "true" are different requests. */
  value: unknown;
  /** userAccId -> the revision the admin inspected. */
  revisions: Record<string, string>;
  alsoTemplate?: boolean;
  templateRevision?: string;
  /**
   * Scope the change to THIS subscription's future members, via the proxy's seed
   * overlay. The alternative to alsoTemplate, which reaches every subscription
   * running the agent.
   */
  alsoSubscription?: boolean;
}

export interface ReapplyResult {
  ok: boolean;
  detail?: string;
}

export interface InstanceOutcome {
  userAccId: string;
  email?: string;
  outcome: Outcome;
  detail?: string;
  /** Base name of the migration record, which is what a later revert is found by. */
  migration?: string;
  recordError?: string;
  /**
   * Absent when nothing was written, so "the reapply ran and succeeded" stays
   * distinguishable from "no reapply happened" — the proxy makes it a pointer for
   * exactly that reason.
   */
  reapplied?: ReapplyResult;
}

export interface TemplateResult {
  ok: boolean;
  detail?: string;
  migration?: string;
}

export interface ScopeConfigResult {
  key: string;
  outcomes: InstanceOutcome[];
  /** outcome -> count. */
  summary: Record<string, number>;
  /**
   * Reported separately from an error because the template is the LAST step: the
   * instance writes it accompanies have already landed, and `ok: false` means
   * future members do not inherit — never that the batch failed.
   */
  template?: TemplateResult;
  /** The scoped-seed half. Same shape as template, different population. */
  subscription?: TemplateResult;
}

// --- defensive parsing ---------------------------------------------------
//
// A malformed or partial response degrades to an empty view instead of throwing,
// following parseSecretNames in lib/secrets.ts: the panel that renders this is
// also the panel that would have to report the failure, and one that cannot mount
// reports nothing at all.

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// An unrecognised state cannot be shown as one of the three that claim something
// about the document's content. "unreadable" is the only one that claims nothing.
function bucketState(v: unknown): BucketState {
  return (BUCKET_STATES as readonly string[]).includes(str(v)) ? (v as BucketState) : "unreadable";
}

// Same reasoning, inverted: an outcome we cannot recognise must not be reported
// as applied or unchanged, so it lands on the one that means "something went wrong".
function outcome(v: unknown): Outcome {
  return (CONFIG_OUTCOMES as readonly string[]).includes(str(v)) ? (v as Outcome) : "error";
}

function parseInstance(raw: unknown): ConfigKeyInstance {
  const r = asRecord(raw);
  const inst: ConfigKeyInstance = { userAccId: str(r.userAccId), revision: str(r.revision) };
  if (typeof r.email === "string") inst.email = r.email;
  if (typeof r.detail === "string") inst.detail = r.detail;
  return inst;
}

function parseBucket(raw: unknown): ConfigKeyBucket {
  const r = asRecord(raw);
  const bucket: ConfigKeyBucket = {
    state: bucketState(r.state),
    count: num(r.count),
    instances: Array.isArray(r.instances) ? r.instances.map(parseInstance) : [],
  };
  // Copied only when the key is PRESENT. Assigning r.value unconditionally would
  // put a `value: undefined` on every absent bucket, which erases the
  // absent-vs-null distinction this whole feature rests on.
  if ("value" in r) bucket.value = r.value;
  return bucket;
}

function parseCatalog(raw: unknown): TemplateCatalog {
  const r = asRecord(raw);
  const entries = Array.isArray(r.keys) ? r.keys : [];
  return {
    template: str(r.template),
    // An entry with no key names nothing the picker could offer or the apply could
    // address, so it is dropped rather than rendered blank.
    keys: entries
      .map(asRecord)
      .filter((e) => typeof e.key === "string" && e.key !== "")
      .map((e) => ({ key: e.key as string, value: e.value, managed: e.managed === true })),
    templateRevision: str(r.templateRevision),
  };
}

function parseInspection(raw: unknown): ScopeConfigInspection {
  const r = asRecord(raw);
  return {
    key: str(r.key),
    agent: str(r.agent),
    total: num(r.total),
    buckets: Array.isArray(r.buckets) ? r.buckets.map(parseBucket) : [],
  };
}

function parseOutcome(raw: unknown): InstanceOutcome {
  const r = asRecord(raw);
  const out: InstanceOutcome = { userAccId: str(r.userAccId), outcome: outcome(r.outcome) };
  if (typeof r.email === "string") out.email = r.email;
  if (typeof r.detail === "string") out.detail = r.detail;
  if (typeof r.migration === "string") out.migration = r.migration;
  if (typeof r.recordError === "string") out.recordError = r.recordError;
  // Left absent when the proxy omitted it -- see InstanceOutcome.reapplied.
  if (r.reapplied !== undefined && r.reapplied !== null) out.reapplied = parseOk(r.reapplied);
  return out;
}

function parseOk(raw: unknown): { ok: boolean; detail?: string } {
  const r = asRecord(raw);
  const res: { ok: boolean; detail?: string } = { ok: r.ok === true };
  if (typeof r.detail === "string") res.detail = r.detail;
  return res;
}

function parseSummary(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(asRecord(raw))) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function parseResult(raw: unknown): ScopeConfigResult {
  const r = asRecord(raw);
  const res: ScopeConfigResult = {
    key: str(r.key),
    outcomes: Array.isArray(r.outcomes) ? r.outcomes.map(parseOutcome) : [],
    summary: parseSummary(r.summary),
  };
  if (r.template !== undefined && r.template !== null) {
    const t = asRecord(r.template);
    const tpl: TemplateResult = parseOk(t);
    if (typeof t.migration === "string") tpl.migration = t.migration;
    res.template = tpl;
  }
  if (r.subscription !== undefined && r.subscription !== null) {
    const o = asRecord(r.subscription);
    const ov: TemplateResult = parseOk(o);
    if (typeof o.migration === "string") ov.migration = o.migration;
    res.subscription = ov;
  }
  return res;
}

// --- fetchers ------------------------------------------------------------

// Not scopeParams from lib/admin.ts: that emits a `scope` parameter, and these
// endpoints deliberately have none. The proxy's adminBulkConfigScope is modelled
// on adminInstanceKey rather than adminScope because this feature's ceiling is one
// subscription -- and the ceiling holds because there is no tenant form of the
// request to make, not because a check rejects one.
//
// `agent` is passed explicitly rather than read off scope.agent: every path here
// is per-agent (the template is per-agent, and the proxy refuses agent=all), so it
// is a required argument, not an optional narrowing of the scope.
function bulkParams(scope: ScopeRef, agent: string): URLSearchParams {
  const q = new URLSearchParams({ tenant_id: scope.tenantId });
  if (scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  q.set("agent", agent);
  return q;
}

// json().catch on the success path too: a 200 that is not JSON (a gateway error
// page) must land on the empty shape rather than throwing past the parse.
async function body(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

export async function listConfigKeys(scope: ScopeRef, agent: string): Promise<TemplateCatalog> {
  const res = await fetch(`/api/admin/scope-config/keys?${bulkParams(scope, agent).toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  return parseCatalog(await body(res));
}

export async function inspectConfigKey(
  scope: ScopeRef,
  agent: string,
  key: string,
): Promise<ScopeConfigInspection> {
  const q = bulkParams(scope, agent);
  q.set("key", key);
  const res = await fetch(`/api/admin/scope-config/inspect?${q.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  return parseInspection(await body(res));
}

// alsoTemplate is opt-in ON THE WIRE, not merely falsy: a template write seeds
// future members of every subscription, and of every agent declaring the same
// template. templateRevision rides along only with it, matching the proxy, which
// reads the field only when AlsoTemplate is set.
function serializeChange(change: ScopeConfigChangeBody): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: change.key,
    value: change.value,
    revisions: change.revisions,
  };
  if (change.alsoTemplate) {
    out.alsoTemplate = true;
    if (change.templateRevision !== undefined) out.templateRevision = change.templateRevision;
  }
  // No revision rides with the scoped seed: the proxy upserts one key into the
  // overlay, so two admins scoping DIFFERENT keys do not conflict and a whole-file
  // token would 409 writes that never collided.
  if (change.alsoSubscription) out.alsoSubscription = true;
  return out;
}

// bulkPolicyURL is why this endpoint cannot use withPolicy directly.
//
// policyParams OMITS the parameter for mode "now" — "absent means now", which is
// true of every other admin endpoint because parsePolicyFields defaults to now.
// This one defaults an absent parameter to NOTICE instead (proxy DEC-9): "now"
// here means bouncing every changed member of the subscription at once, which is
// the wrong thing to do when nobody asked for it.
//
// So the omission that is a harmless URL tidy-up everywhere else would invert the
// admin's choice here: picking "now" would send nothing and get a notice. "now" is
// therefore sent EXPLICITLY, and an admin who sends no policy at all still gets
// the safer default.
function bulkPolicyURL(url: string, policy: RestartPolicy): string {
  const withMode = withPolicy(url, policy);
  if (policy.mode !== "now") return withMode;
  return withMode + (withMode.includes("?") ? "&" : "?") + "restart=now";
}

export async function applyConfigKey(
  scope: ScopeRef,
  agent: string,
  change: ScopeConfigChangeBody,
  // How the resulting bounce of every CHANGED workspace is delivered
  // (restart-control FR-4). On the query string, like every other admin mutation:
  // the proxy parses it before it touches the body, so a bad policy 400s a change
  // that has not landed yet.
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<ScopeConfigResult> {
  const url = bulkPolicyURL(`/api/admin/scope-config?${bulkParams(scope, agent).toString()}`, policy);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeChange(change)),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return parseResult(await body(res));
}
