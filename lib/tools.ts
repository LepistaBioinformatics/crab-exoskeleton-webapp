// The gateway `/tools` entry (surfaced via the BFF at /api/tools). `name`
// equals the guest-role (e.g. "alpha", "beta"), so it joins to an agent
// leaf's `role`. Used only to enrich the sidebar (tooltip + health), never to
// gate it. `healthStatus` shape isn't fixed, so it's typed `unknown` and probed
// defensively.
export interface Tool {
  name: string;
  description: string;
  capabilities: string[];
  toolType: string;
  isContextApi: boolean;
  openapiPath: string;
  healthStatus: unknown;
}

// Fetches the tool catalog for sidebar enrichment. ALWAYS resolves to an array
// -- returns [] on any failure (non-ok response or transport error) so a broken
// /tools never breaks the workspace nav.
export async function listTools(): Promise<Tool[]> {
  try {
    const res = await fetch("/api/tools");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.tools) ? (data.tools as Tool[]) : [];
  } catch {
    return [];
  }
}

// Best-effort health read. The healthStatus shape isn't guaranteed, so this
// defaults to healthy and only reports unhealthy on an explicit negative signal
// (`healthy === false` or a known bad `status`). A mis-read that dims a working
// agent is recoverable (it stays clickable); one that hides it isn't -- hence
// the conservative default.
export function isToolHealthy(tool: Tool): boolean {
  const h = tool.healthStatus;
  if (!h || typeof h !== "object") return true;
  const rec = h as Record<string, unknown>;
  if (rec.healthy === false) return false;
  const status = typeof rec.status === "string" ? rec.status.toLowerCase() : null;
  if (status && ["unhealthy", "down", "error", "unavailable"].includes(status)) {
    return false;
  }
  return true;
}
