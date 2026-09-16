# tenant-subscription-admin — Context

Decisions the project owner made before the specification was written, and the
evidence each was weighed against. Recorded so the reasoning survives the
decision.

---

## D-1 — Scope: the four operational surfaces, plus two the reference SPA cannot do

**Chosen:** tenants (list, create, delete), subscription accounts (list, create,
rename, delete), guest roles (list only — see D-5), on top of the invite and
revoke this app already shipped — **and** two capabilities `mycelium-webapp` lacks: renaming
a tenant, and the account status lifecycle.

**Why the two extras cost almost nothing.** The reference SPA's
`EditTenantModal.tsx` is imported by nothing and its service layer has no
edit-tenant call, so a tenant's name is effectively immutable there. But
`tenantOwner.tenant.updateNameAndDescription` is a registered method, and the
panel that renders a tenant is already being built. The same holds for
`userManager.account.*`.

**Rejected — parity.** Error codes, webhooks, service discovery, API tokens,
staff promotion, tenant legal and notification metadata, Telegram integration.
The screen inventory classified each as a one-time setup step or as irrelevant to
this stack; a single curl covers the setup ones. Porting them would roughly
double the surface for capabilities nobody exercises weekly.

**Rejected — the minimum.** Matching the SPA exactly would carry its gaps
forward, including a tenant created with a typo that no UI can fix.

## D-2 — The tenant brand logo is in scope

**Chosen:** the console can set a tenant's logo.

**Why this was a real question.** One research pass classified the SPA's Brand
tab as unused — "a tag taxonomy driving white-label styling the stack doesn't
render". That is wrong, and the code says so: `app/chat/tenant-brand.ts:35-39`
reads the tenant tag whose `value` is `"brand"` and returns `meta.base64Logo` and
`meta.primaryColor`, and `components/ui/avatar.tsx` draws it beside the tenant
name in the workspace sidebar. This app has rendered that logo since the
`tenant-avatar-sidebar` feature, whose own spec recorded the asymmetry as a
non-goal: *"No editing/upload of branding from crab (that lives in
mycelium-webapp)."*

So the choice was not "port an unused screen" but "keep a rendering path alive or
let it die". Existing logos would keep working either way; every tenant created
after the removal would fall back to an initials avatar, permanently.

**Cost accepted:** a tag write replaces the entire `meta` map rather than merging
it, so every write re-sends `primaryColor` and anything else already there. The
reference implementation carries a comment warning about exactly this.

## D-3 — The tenant's creator becomes its owner

**Chosen:** `managers.tenants.create` is called with `ownerId` set to the calling
user's own id, resolved server-side.

**The trap this avoids.** `with_tenant_ownership_or_error` is the one permission
helper in the gateway with no staff or manager bypass, and all four
`tenantOwner.tenant.*` mutators go through it. A staff account can therefore
create a tenant it cannot subsequently rename, archive or verify — every edit
returns a refusal, and for rename the refusal arrives as `-32602`, which reads as
a malformed request rather than a permission problem.

**Rejected — an explicit owners panel.** More honest about mycelium's model, and
`includeTenantOwner`/`excludeTenantOwner` are available for it later. But it makes
the ordinary path a two-step: create the tenant, add yourself, then edit. The
first thing an admin does after creating a tenant would fail until they knew to
do something the UI never explained.

The decision is invisible in the interface but stated in it: the create form says
the creator becomes the owner.

## D-4 — A branch column, addressable in the URL

**Chosen:** the directory is a branch root row — selecting it opens a tenants
column, selecting a tenant opens that tenant's sections — with the selection in
the query string.

**Why not the simpler leaf.** A single panel with an in-tenant selector touches
fewer files, but it puts the tenant choice in component state, where a reload, a
shared link and the Back button all lose it. `admin-screen.tsx` records that the
URL is the single source of truth and that the screen was rebuilt around that
property; a new area that opted out would be the one place it did not hold.

**Cost accepted:** more files, new column keys, and heading, empty-state and
next-column copy in both locales.

---

## Two facts that constrained everything above

**The console cannot bootstrap staff, and should not pretend to.** The first
staff account of a fresh install comes from `/_adm/instance/bootstrap`, a public,
REST-only, one-shot flow whose claimed state lives in the database rather than in
any configuration. This stack claimed it in July 2026 (`STATE.md` AD-008), so
`staff@localhost` exists and signs in through the ordinary magic link. Everything
here requires a caller who is already staff or manager.

**A permission refusal is currently invisible.** The RPC endpoint answers HTTP
200 for every refusal, carries `FORBIDDEN` as a non-standard `-32401`, and puts
the stable discriminator in `error.data.code`. `myceliumRpc` flattens all of it
to a status 400 with a message. The four existing call sites tolerate this
because they are rarely refused; an administration console would report every
genuine refusal as "something went wrong". Fixing the transport is therefore the
first task, not a cleanup at the end.

## D-5 — Guest roles are read-only, and the whole write surface went, not just create

**Chosen:** the guest-roles screen lists and nothing else, and the BFF exposes no
write route for a role.

**Asked for:** "don't offer creating new ones — they must only be the ones in the
mycelium config file, propagated when the gateway comes up."

**Why it took the rest with it.** The stated principle settles create immediately:
a role created here is referenced by no route, so the agent it names routes
nowhere. Reading the propagation showed the same principle condemns the other
three, for a reason that is not obvious from outside:
`propagate_declared_roles_to_storage_engine` calls `get_or_create`, and the
repository matches on **`(slug, permission)`**. It creates; it never updates.

So a **rename** makes the declared slug stop matching, and the next gateway start
creates a fresh empty role beside the renamed one — with every existing grant left
on the orphan and the gateway routing on the new one. A **permission change** does
the same, because the permission is half the match key. A **delete** is undone at
the next start, except for the grants it revoked, which do not come back.

Leaving delete in place was the tempting middle ground, and it is the worst of the
three: it is the only one that destroys something irreversibly while appearing to
have worked.

**Deliberately not built, and worth knowing about.** A role whose declaration was
REMOVED from the config does linger in the database, and cleaning that up is a
real need this screen no longer serves. Serving it honestly means showing which
roles the gateway still declares, which `gatewayManager.routes.list` could answer.
That is a feature, not a button.

## D-6 — The status lifecycle came out again, and verify with it

**Chosen, after the screens were built and looked at:** the subscription list
shows its status as badges and offers only delete; the tenant overview keeps
rename, archive and delete, and loses verify.

**What this reverses.** D-1 took the account status lifecycle as one of the two
things worth having beyond what the reference SPA does. Seeing it on screen
answered the question differently: six toggles in a row beside a delete button
made the destructive control just one more item in the line, and none of those
states is one this console has a reason to drive. Verify went for the same reason
on the tenant side.

**Archive stayed on the tenant, and that was a correction.** The instruction
arrived twice and contradicted itself — once to remove archive and verify, once to
remove verify alone. The conservative reading won, because deleting a control that
was asked to be kept is the more expensive mistake of the two.

**The routes went with the buttons**, not just the controls. An admin mutation
nobody can reach from the UI is still reachable; the route is the boundary and the
button is the convenience. The badges that report these states stay — reading a
state is not the same as driving it.
