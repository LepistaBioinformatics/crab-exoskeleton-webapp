// The admin's choice of how a change that needs a container bounce is delivered
// (restart-control FR-8). Client-side only: it is a per-session preference, not
// something the proxy stores.

export const RESTART_MODES = ["now", "notice", "schedule"] as const;
export type RestartMode = (typeof RESTART_MODES)[number];

export interface RestartPolicy {
  mode: RestartMode;
  // Local datetime-local value ("YYYY-MM-DDTHH:mm"), only meaningful for
  // mode === "schedule".
  at?: string;
  note?: string;
}

// "now" is the default because it is what every one of these endpoints did
// before the policy existed — an admin who ignores the control gets the old
// behaviour.
export const DEFAULT_POLICY: RestartPolicy = { mode: "now" };

export const MODE_LABEL: Record<RestartMode, string> = {
  now: "Restart now",
  notice: "Notify members",
  schedule: "Schedule for…",
};

export const MODE_HINT: Record<RestartMode, string> = {
  now: "Applies immediately. Anyone mid-conversation is briefly interrupted.",
  notice: "Applies on disk now; each member restarts when it suits them.",
  schedule: "Applies on disk now; every running instance restarts at the time you pick.",
};

// Turns the policy into the query parameters the BFF forwards to the proxy.
// `at` is converted from the browser's local datetime-local value to RFC3339
// UTC here, so the admin picks a time in their own zone and the proxy always
// receives an unambiguous instant.
export function policyParams(policy: RestartPolicy): URLSearchParams {
  const q = new URLSearchParams();
  if (policy.mode === "now") return q; // absent means "now"; keep URLs clean
  q.set("restart", policy.mode);
  if (policy.mode === "schedule" && policy.at) {
    const when = new Date(policy.at);
    if (!Number.isNaN(when.getTime())) q.set("restart_at", when.toISOString());
  }
  if (policy.note) q.set("restart_note", policy.note);
  return q;
}

// Whether the policy is complete enough to submit. A schedule with no time (or
// a past one) would be rejected by the proxy with a 400, so the form blocks it
// rather than sending a request that cannot succeed.
export function policyIsValid(policy: RestartPolicy): boolean {
  if (policy.mode !== "schedule") return true;
  if (!policy.at) return false;
  const when = new Date(policy.at);
  return !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
}

// Appends the policy to a URL that may already carry a query string.
export function withPolicy(url: string, policy: RestartPolicy): string {
  const q = policyParams(policy).toString();
  if (!q) return url;
  return url + (url.includes("?") ? "&" : "?") + q;
}
