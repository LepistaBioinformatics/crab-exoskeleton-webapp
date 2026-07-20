# Feature: Tenant Brand Avatar in Sidebar

## Summary

Show each tenant's brand logo (uploaded in mycelium-webapp) as a small avatar
to the left of the tenant name in the crab exoskeleton workspace sidebar. This
gives a **local** (tenant / AI-scope) identity marker alongside the untouched
**global** application logo in the nav header.

## Context

- **Data origin (mycelium):** the tenant logo is stored as a tenant *tag* with
  `value === "brand"` and `meta.base64Logo` — a compressed data URL
  (webp/jpeg). Source: `mycelium-webapp/.../Tenants/Details/BrandCard.tsx`.
  The brand tag `meta` may also carry `primaryColor`.
- **Data already available:** `app/chat/workspace-nav.tsx` already fetches
  `GET /api/tenants/{id}` (proxy to `/_adm/beginners/tenants/{id}`) lazily per
  tenant to resolve the display name. That endpoint returns the full `Tenant`
  including `tags[]` (confirmed in `mycelium-schema.d.ts`: `Tenant.tags`,
  `Tag.value`, `Tag.meta`). No new endpoint or proxy is needed.
- **Render site:** the tenant-level `GroupHeader` in `workspace-nav.tsx`
  currently shows a generic `Building2` icon (15px) + label. The avatar
  replaces that icon at the tenant level only.

## Requirements

- **R1** — When a tenant has a brand logo (`base64Logo`), render it as a small
  rounded-square avatar to the left of the tenant name, replacing the
  `Building2` icon at the tenant level.
- **R2** — When a tenant has no brand logo, render an initials avatar derived
  from the tenant display name (rounded-square, same size). If the brand tag
  carries `primaryColor`, use it as the initials background.
- **R3** — Until the tenant name resolves (still showing the uuid), fall back
  to the `Building2` icon (initials from a uuid are meaningless).
- **R4** — The global application logo in the nav-sidebar header is untouched.
- **R5** — Reuse the existing per-tenant fetch; do not add network calls.
- **R6** — Avatar size matches the current icon footprint (~16px) so the tree
  layout / indentation is unchanged.

## Non-goals

- No avatar for account or agent levels.
- No editing/upload of branding from crab (that lives in mycelium-webapp).
- No caching layer beyond what workspace-nav already does.

## Design (inline)

- New component `components/ui/avatar.tsx` — `TenantAvatar`:
  - Props: `{ name: string; logo?: string | null; color?: string | null }`.
  - `cva` for the static container className (rounded-square, size, overflow).
    Dynamic initials background comes via inline `style` (not className), per
    the project's cva-only className rule.
  - Renders `<img>` when `logo` is present, else initials (1–2 chars from name
    words), else nothing special (caller decides Building2 fallback via R3).
- `workspace-nav.tsx`:
  - Add `tenantLogos` / `tenantBrandColors` state maps (or a single
    `Record<string, { logo?; color? }>`), populated in the existing lazy fetch
    effect by locating the `value === "brand"` tag and reading `meta`.
  - At the tenant `GroupHeader`, pass a `TenantAvatar` as `icon` when the name
    is resolved; otherwise keep `<Building2 />` (R3).

## Files

- `components/ui/avatar.tsx` (new)
- `app/chat/workspace-nav.tsx` (edit)

## Risks

- **RISK-1 — RESOLVED.** The postgres adapter `get_tenant_public_by_id`
  (`.../diesel_postgres/.../tenant_fetching.rs:169`) loads the tenant tags
  *including `meta`* and sets `tenant.tags = Some(tags)`. So the beginners
  endpoint returns `base64Logo`/`primaryColor` in the payload crab already
  fetches. Access is gated by tenant license/ownership, which the sidebar
  caller already has.
- **RISK-2 — RESOLVED.** No CSP in `middleware.ts` / `next.config.ts` /
  `app/layout.tsx` restricting `img-src`, so `data:` images render.
- **RISK-3** — `base64Logo` ships in the already-fetched tenant JSON — no
  extra network cost.
