"use client";

import { useEffect, useState } from "react";
import type { TenantGroup } from "@/lib/subscriptions";

// Tenant display names and branding, resolved lazily from /api/tenants/<id>.
//
// Extracted so the workspaces tree and the workspace grid cannot drift on it: the
// brand's on-the-wire shape is an inference about mycelium's tag model, not a typed
// contract, so two copies of that inference would eventually disagree.

export type TenantBrand = { logo?: string; color?: string };

export interface TenantBranding {
  names: Record<string, string>;
  brands: Record<string, TenantBrand>;
}

export function tenantDisplayName(tenant: unknown): string | null {
  if (tenant && typeof tenant === "object") {
    const name = (tenant as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

// The tenant brand is stored in mycelium as a tag with value "brand"; its meta
// carries the base64 logo (a data URL) and optional brand colors. Returns the
// logo + primaryColor for an avatar, or null when there's no brand tag.
export function tenantBrand(tenant: unknown): TenantBrand | null {
  if (!tenant || typeof tenant !== "object") return null;
  const tags = (tenant as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return null;
  const brand = tags.find(
    (tag) => tag && typeof tag === "object" && (tag as { value?: unknown }).value === "brand",
  ) as { meta?: Record<string, string> | null } | undefined;
  const meta = brand?.meta;
  if (!meta) return null;
  return { logo: meta.base64Logo, color: meta.primaryColor };
}

/**
 * Resolves each tenant's name and brand, one request per tenant.
 *
 * Deliberately non-blocking and failure-tolerant: callers render immediately with
 * uuids and each name replaces one as its fetch lands. A tenant whose lookup fails
 * keeps its uuid rather than taking the whole view down with it.
 */
export function useTenantBranding(groups: TenantGroup[] | null): TenantBranding {
  const [names, setNames] = useState<Record<string, string>>({});
  const [brands, setBrands] = useState<Record<string, TenantBrand>>({});

  useEffect(() => {
    if (!groups) return;
    let cancelled = false;
    for (const tenant of groups) {
      fetch(`/api/tenants/${encodeURIComponent(tenant.tenantId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const name = tenantDisplayName(data.tenant);
          if (name) setNames((prev) => ({ ...prev, [tenant.tenantId]: name }));
          const brand = tenantBrand(data.tenant);
          if (brand) setBrands((prev) => ({ ...prev, [tenant.tenantId]: brand }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [groups]);

  return { names, brands };
}
