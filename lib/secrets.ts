import { errorCode } from "@/lib/i18n/errors";
import type { Workspace } from "@/app/chat/fragment";

// Names only -- values are write-only and never returned by the proxy.
export interface SecretNames {
  dotenv: string[];
  json: string[];
  native: string[];
  file: string[];
}

export const SECRET_FORMATS = ["dotenv", "json", "file", "native"] as const;
export type SecretFormat = (typeof SECRET_FORMATS)[number];

// The formats an end user may WRITE. `native` targets picoclaw's own
// .security.yml slots (search-provider and model keys) and moved to the admin
// surface — see native-secrets-admin-only. Users can still see and delete a
// native entry they set before the change; they just cannot create one.
export const USER_SECRET_FORMATS = SECRET_FORMATS.filter((f) => f !== "native");

// Fixed picoclaw web-search slots (crab-shell-proxy secrets.go webProviders).
// A native web slot is `web.<provider>`; the proxy rejects anything else.
export const WEB_PROVIDERS = [
  "brave",
  "tavily",
  "kagi",
  "gemini",
  "perplexity",
  "glm_search",
  "baidu_search",
] as const;

// dotenv/json/file names: safe charset (matches the proxy's validateSecretName)
// -- a fast client-side fail before the proxy's own 400.
export const SECRET_NAME_RE = /^[A-Za-z0-9._-]+$/;

function workspaceQuery(workspace: Workspace): URLSearchParams {
  return new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
  });
}

/**
 * WHICH FORMATS THIS AGENT'S HARNESS ACTUALLY DELIVERS.
 *
 * The tab offers four and they do not all arrive. Under the ganglion `dotenv` and
 * `json` become marked environment the shell can read; `native` is picoclaw's own
 * slot file, and `file` has never reached any harness at all. A member picking one
 * of the last two saved a credential, got a 200, and their agent could not see it
 * -- with nothing anywhere saying so.
 *
 * Keyed on the harness rather than shipped as a list from the proxy, so the answer
 * lives once and beside the formats it is about.
 */
export function formatReaches(format: SecretFormat, harness: string | null): boolean {
  // Unknown harness: claim nothing. A wrong "your agent cannot see this" is worse
  // than no badge, and the proxy only omits this for a version that predates it.
  if (harness === null) return true;
  if (format === "file") return false;
  if (harness === "ganglion") return format === "dotenv" || format === "json";
  return true;
}

export interface SecretListing extends SecretNames {
  /** Which runtime this agent orchestrates, or null from a proxy that predates it. */
  harness: string | null;
  /**
   * Names of THIS member's secrets that also exist in a scope above them.
   *
   * The cascade is "user wins", so these are the ones their own value is silently
   * replacing an admin's with -- and the member is the one who can undo it.
   */
  shadowing: string[];
}

export async function listSecrets(workspace: Workspace): Promise<SecretListing> {
  const res = await fetch(`/api/secrets?${workspaceQuery(workspace).toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  const s = data.secrets ?? {};
  return {
    dotenv: Array.isArray(s.dotenv) ? s.dotenv : [],
    json: Array.isArray(s.json) ? s.json : [],
    native: Array.isArray(s.native) ? s.native : [],
    file: Array.isArray(s.file) ? s.file : [],
    harness: typeof data.harness === "string" ? data.harness : null,
    shadowing: Array.isArray(data.shadowing) ? data.shadowing : [],
  };
}

export async function setSecret(
  workspace: Workspace,
  input: { format: SecretFormat; name: string; value: string },
): Promise<void> {
  const res = await fetch("/api/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: workspace.t,
      subs_acc_id: workspace.s,
      role: workspace.r,
      format: input.format,
      name: input.name,
      value: input.value,
    }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

export async function deleteSecret(
  workspace: Workspace,
  input: { format: SecretFormat; name: string },
): Promise<void> {
  const query = workspaceQuery(workspace);
  query.set("format", input.format);
  query.set("name", input.name);
  const res = await fetch(`/api/secrets?${query.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorCode(res));
}

// Surfaces the proxy's real reason (400 bad name/slot, 403 unlicensed) rather
// than a masked "connectivity".
