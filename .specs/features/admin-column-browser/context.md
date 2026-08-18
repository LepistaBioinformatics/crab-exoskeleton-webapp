# admin-column-browser — Context

Decisions taken with the user before the spec. This feature REPLACES the shell shipped
by `backoffice-admin-shell` two sessions ago; where a decision reverses one of that
feature's, it says so.

---

## Why the previous shell is being replaced

The ask was a backoffice layout, and what shipped was a left rail whose body switched
between a two-step progress list and a section list, with a `ScopeTree` inside a gate and
a sticky context bar above the panel. The user's verdict: the sidebar is confusing, and so
is the selected-scope display.

That verdict is right, and the reason is worth writing down rather than treating as taste.
The previous design **moved** the confusion instead of removing it:

- The nesting was expressed twice, in two different idioms — the rail nested sections
  under a menu item, and a TREE nested subscriptions under tenants inside a gate. Two
  grammars for one hierarchy.
- The rail's body meant different things at different times (steps, then sections), so the
  same region of the screen answered different questions depending on state nobody could
  see from the outside.
- The context bar existed because nothing else on screen said what was selected. A
  navigation that showed the path would not have needed a second component to narrate it.

A column browser removes all three at once: one idiom, one meaning per column, and the
path is the navigation rather than a caption under it.

## DEC-1 — Miller columns, not a rail

Navigation is a horizontal strip of columns, each showing the CHILDREN of the row selected
in the column before it — the macOS Finder column view. Clicking a row opens the next
column to its right; the strip is the path.

The user asked for this by name, and it fits the domain: the admin target genuinely is a
path (agent → tenant → subscription → section), and every previous attempt to show that
path as something other than a path has failed.

It also is NOT a new grammar for this codebase. `app/chat/unified-sidebar.tsx` already
slides a two-panel track — "which agent, then which conversation" — with a `resolvePanel`
pure module and an `armed` rule so the first position does not animate. The column browser
is that idiom generalised, and the mobile form reuses it directly.

## DEC-2 — Branding is a LEAF of the root column

**The user's correction, and it settles the root's shape.** The root column holds
`Branding` and `Agents`. `Branding` opens NO column to its right: it is instance-wide,
there is no scope to choose, so its panel opens immediately across the whole content area.
Only `Agents` branches.

Leaf and branch are therefore distinguishable at a glance — a branch carries a `▸`, a leaf
does not. That mark is the column browser's one structural affordance, and it has to mean
exactly one thing: "there is more to the right".

## DEC-3 — Tenants and subscriptions are TWO columns

Pure Finder: a tenants column, then that tenant's subscriptions. The flat alternative (one
column of `Innovation › Marketing Squad` rows) was offered and rejected — it costs one
click fewer today but breaks the "each column is the children of the last" rule that makes
the whole thing legible, and it does not scale past a handful of tenants.

**The tenant-wide scope is the FIRST ROW of the subscriptions column**, labelled as the
whole tenant, and offered only when the caller actually holds the tenant scope. That is
where it belongs: choosing "the tenant itself" is a choice among that tenant's targets,
which is what the subscriptions column lists.

## DEC-4 — The panel is pinned right; the columns scroll

The column strip scrolls horizontally inside itself and the panel keeps the remaining
width. The panels here are wide — a JSON editor, the model registry table, the member
roster — and a literal Finder, where the panel is the last column of one scrolling strip,
would make them compete with navigation for width.

With `Branding` selected there are no intermediate columns at all: root column, then its
panel across the rest.

## DEC-5 — The "reaches" sentence survives only on mobile

On desktop the columns spell the path, so the sentence would be the same information
twice. On mobile one column shows at a time, and there the sentence is the only thing
saying where you are — so it stays, in the panel's header.

The restart control keeps the placement `backoffice-admin-shell` FR-10 gave it — one mount
point, always visible — but moves with the context bar into the PANEL HEADER. The
requirement it answers ("sempre visível na tela, no menu que estamos criando") is
unchanged: the panel header is present on both breakpoints and does not scroll away.

## DEC-6 — No trees

`ScopeTree` is deleted, not adapted. It is used by nothing outside the admin screen. The
user asked for continuity over trees, and a tree inside a column would be the exact
two-grammars problem this feature exists to remove.

## DEC-7 — The visual system does not change; the path is the signature

Tokens (`fg`, `fg-muted`, `brand`, `accent`, `surface`, `elevated`), the type scale, `cva`
for every variant, no inline conditional `className`. No new palette, no new typeface —
the brief pinned the visual direction and the brief wins.

The one deliberate risk: **a selected row in a column that is no longer the active one is
drawn quieter than the active column's selection.** Finder does this, and here it encodes
something true and load-bearing — the difference between "where I am" and "how I got
here". It is the only place this design spends emphasis, and it exists because not knowing
what was selected is the bug being fixed.

## DEC-8 — `?tenant=` joins the URL, and `?scope=` wins

Selecting a tenant opens its subscriptions column without selecting a scope, so that
intermediate state needs an address. `?tenant=` carries it.

The two can disagree in a hand-edited URL, so the rule is explicit and tested: when
`?scope=` resolves, the open tenant is DERIVED from it and `?tenant=` is ignored;
`?tenant=` decides only when no scope is selected. One value, one owner, no drift.

## DEC-9 — Mobile is one column at a time, sliding

The columns become a drill-down: one at a time, sliding left as you go deeper, with a back
control naming the column you came from. Same grammar as the chat sidebar's track,
including the rule that the first position must not animate.

---

## Constraints carried into the spec

- **Repo**: `crab-exoskeleton-webapp` only. Artifacts under
  `.specs/features/admin-column-browser/`.
- **i18n**: every string through `adminCopy` / `useT`, `en` + `pt`, `parity.test.ts` gates.
- **Gate**: `npx tsc --noEmit` (baseline **5** errors in 4 untouched test files — "still
  5", not zero), `npx vitest run`, and `yarn build`.
- **Purity**: the column model is a pure function with a truth table over it. This screen
  has now been rebuilt twice around navigation state nobody could see; the rules do not
  live in the component.
- **Another agent is working in this tree** (`app/chat/**`, `lib/i18n/chat.ts`). Nothing
  here touches those files.
