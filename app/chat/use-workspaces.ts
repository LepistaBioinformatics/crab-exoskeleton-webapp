"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  groupWorkspaces,
  type Subscription,
  type TenantGroup,
} from "@/lib/subscriptions";

// The caller's workspaces as a tenant → subscription → agent tree.
//
// Shared rather than fetched per screen because the three consumers had already drifted
// on the part that matters least visibly and most operationally: what happens when the
// session expired while the screen was open. This sends the member to /signin, once,
// for all of them.
//
// The list is small and the request cheap, so each consumer keeping its own copy is
// fine; what must not differ is the handling.
export function useWorkspaceGroups(): {
  groups: TenantGroup[] | null;
  /** An error CODE, resolved to a sentence at render time so a locale switch re-renders it. */
  error: string | null;
} {
  const router = useRouter();
  const [groups, setGroups] = useState<TenantGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/subscriptions");
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!cancelled) {
            setError(
              typeof data?.error === "string" ? data.error : "workspaces_load_failed",
            );
          }
          return;
        }
        const data = await res.json();
        const subs: Subscription[] = Array.isArray(data.subscriptions)
          ? data.subscriptions
          : [];
        if (!cancelled) setGroups(groupWorkspaces(subs));
      } catch {
        if (!cancelled) setError("connectivity");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { groups, error };
}
