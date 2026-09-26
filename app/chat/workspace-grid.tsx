"use client";

import { cva } from "class-variance-authority";
import { Eye } from "lucide-react";
import { agentRows, type AgentLeaf } from "@/lib/subscriptions";
import { enterWorkspace, type Workspace } from "./fragment";
import { useTenantBranding } from "./tenant-brand";
import { useWorkspaceGroups } from "./use-workspaces";
import DestinationScreen from "./destination-screen";
import EmptyState from "./empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { TenantAvatar } from "@/components/ui/avatar";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The content pane when no workspace is chosen: every AGENT the member can reach.
//
// It exists because the alternative was a welcome message pointing at a sidebar that is
// collapsed on narrow screens — the member had to find the way in before they could use
// anything. Here the way in IS the screen.
//
// ONE ROW PER AGENT, and that is the change from what this was. It used to render the
// tree literally: a section per tenant, a wrapping grid of subscription boxes inside it,
// and the agents as square tiles inside those — three levels of nesting to reach the one
// thing that is clickable. But the tree's shape is the shape of the PERMISSION model,
// not of the question being asked. A member is choosing an agent; the tenant and the
// subscription are facts ABOUT that agent, so they belong on its row.
//
// projects-screen.tsx reached the same conclusion three weeks earlier and its comment is
// the argument here too: a gallery shape spread a handful of objects "across a band
// wider than anything else in the app". A member with six agents has six rows.
//
// The workspace list comes from useWorkspaceGroups, shared with the sidebar and the
// shell — the list is cheap enough to fetch per screen, but how a 401 is handled must
// not differ between them.

const row = cva(
  [
    "flex w-full items-center gap-3 rounded-xl border border-rule-strong bg-surface px-4 py-3 text-left",
    "transition-colors hover:border-accent/60 hover:bg-elevated disabled:opacity-60",
  ].join(" "),
);

// STACKED ON A PHONE, COLUMNS FROM `sm`, out of one DOM rather than two hidden copies.
// The three cells are a column each where there is width and three lines where there is
// not, so nothing is duplicated and nothing is dropped -- a row that hid its tenant on a
// narrow screen would hide the one fact that tells two identically-named agents apart.
const cells = "flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3";

// EVERY ROW ENDS THE SAME WIDTH, which is what makes the three `flex-1` cells above line
// up into columns at all. The read-only marker appears on a minority of rows, so letting
// it size its own slot moved the column boundaries row to row -- a list of columns that
// are only sometimes columns. The slot is always there and sometimes empty, and the
// header carries the same one so its labels sit over the cells rather than past them.
const endSlot = "flex w-4 shrink-0 justify-center";

export default function WorkspaceGrid() {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  // The shared hook, not a local fetch. The private copy this file started with had
  // already drifted on the thing that matters least visibly: it had no 401 branch, so a
  // session that expired while this screen was open showed a generic error instead of
  // sending the member to sign in.
  const { groups, error } = useWorkspaceGroups();
  const { names, brands } = useTenantBranding(groups);

  if (error) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto p-6">
        <div className="w-full max-w-md">
          <Alert severity="error">{errorText(err, error)}</Alert>
        </div>
      </div>
    );
  }

  if (groups === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  // Nothing to choose from is a different situation from "you have not chosen yet",
  // and the existing welcome copy already says the right thing about it.
  if (groups.length === 0) return <EmptyState />;

  const rows = agentRows(groups);

  return (
    // The destination frame, whose own header says it was written for six screens, has
    // one, and that "the second centre screen is the one that would drift, and this is
    // what it will be handed". Its widths were copied FROM this file in the first place.
    <DestinationScreen title={t.workspaceGrid.title} width="full">
      <p className="mt-1 text-sm text-fg-muted">{t.workspaceGrid.body}</p>

      {/* The column names, and only where there ARE columns. Below `sm` the row is three
          stacked lines whose order says what they are; a header floating above a stack
          would label the first line and nothing else. */}
      <div
        aria-hidden
        className="mt-6 hidden items-center gap-3 px-4 text-xs font-medium uppercase tracking-wide text-fg-muted sm:flex"
      >
        {/* Matches the avatar's footprint so the first column name sits over the name,
            not over the picture. */}
        <span className="w-10 shrink-0" />
        <span className={cells}>
          <span className="min-w-0 flex-1 truncate">{t.workspaceGrid.columns.agent}</span>
          <span className="min-w-0 flex-1 truncate">{t.workspaceGrid.columns.tenant}</span>
          <span className="min-w-0 flex-1 truncate">
            {t.workspaceGrid.columns.subscription}
          </span>
        </span>
        <span className={endSlot} />
      </div>

      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((leaf) => (
          <li key={`${leaf.tenantId}|${leaf.subsAccId}|${leaf.role}`}>
            <button type="button" onClick={() => pick(leaf)} className={row()}>
              {/* An initials avatar rather than a robot icon: every agent had the same
                  glyph, so the picture carried nothing and the name did all the work.
                  Two letters plus a colour derived from the name make the rows
                  distinguishable at a glance. */}
              <TenantAvatar name={leaf.role} size="lg" />
              <span className={cells}>
                <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold capitalize text-fg">
                  {leaf.role}
                </span>
                {/* The brand sits WITH the tenant's name, not at the far end of the
                    row. It is a picture of the thing in this cell; parked past the
                    subscription it read as a second identity for the row, competing
                    with the agent's own avatar at the front. */}
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-fg-muted">
                  <TenantAvatar
                    name={names[leaf.tenantId] ?? leaf.tenantId}
                    logo={brands[leaf.tenantId]?.logo}
                    color={brands[leaf.tenantId]?.color}
                  />
                  {/* The uuid until its name lands, then the name. Never blocks. */}
                  <span className="min-w-0 truncate">
                    <span className="sm:hidden">{t.workspaceGrid.columns.tenant}: </span>
                    {names[leaf.tenantId] ?? leaf.tenantId}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-fg-muted">
                  <span className="min-w-0 truncate">
                    <span className="sm:hidden">
                      {t.workspaceGrid.columns.subscription}:{" "}
                    </span>
                    {leaf.accName?.trim() || leaf.subsAccId}
                  </span>
                  <NotSetUp scaffolded={leaf.scaffolded} t={t} />
                </span>
              </span>
              <span className={endSlot}>
                <AccessIcons perms={leaf.perms} t={t} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </DestinationScreen>
  );
}

/**
 * Enters the workspace. It does NOT create a conversation.
 *
 * It used to: `createConversation` first, then `setWorkspace` with the new id. That
 * predates shell-path-and-landing FR-3.5 — "No conversation is created until the member
 * sends" — and was never brought in line, so every entry through this screen minted a
 * transcript nobody asked for. Writing t/s/r alone lands on the landing, whose composer
 * is the one mint.
 *
 * Nothing to await any more, which is why the `entering` guard and its spinner are gone
 * with it: a hash write cannot be in flight.
 */
function pick(leaf: AgentLeaf) {
  const workspace: Workspace = { t: leaf.tenantId, s: leaf.subsAccId, r: leaf.role };
  enterWorkspace(workspace);
}

/**
 * A marker for a subscription with nothing on disk yet, and nothing otherwise.
 *
 * ON THE SUBSCRIPTION CELL, NEVER THE AGENT, and the placement is the whole correctness
 * of it. `scaffolded` is `os.Stat` on the SUBSCRIPTION's directory
 * (crab-shell-proxy internal/docker/manager.go:610), shared by every agent under it — so
 * beside an agent's name it would read as "this agent has never been used", which is a
 * claim the value cannot support. Two agents in one unscaffolded subscription both carry
 * it, and that is correct rather than a repetition bug.
 */
function NotSetUp({ scaffolded, t }: { scaffolded: boolean; t: typeof chatCopy.en }) {
  if (scaffolded) return null;
  return (
    <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[11px] text-fg-muted">
      {t.workspaceGrid.notSetUp}
    </span>
  );
}

/**
 * A marker for READ-ONLY access, and nothing otherwise.
 *
 * Write is the norm, so annotating it said nothing — and a pencil beside an agent's name
 * read as a control: people took it for "rename this". Marking only the exception means the
 * glyph carries information every time it appears, and the common case is quiet.
 */
function AccessIcons({
  perms,
  t,
}: {
  perms: string[];
  t: typeof chatCopy.en;
}) {
  const set = new Set(perms.map((p) => p.toLowerCase()));
  if (set.has("write")) return null;
  return (
    // The wrapper carries the label and the tooltip: lucide icons take neither.
    <span
      role="img"
      aria-label={t.workspaceGrid.readOnly}
      title={t.workspaceGrid.readOnly}
      className="shrink-0 text-fg-muted"
    >
      <Eye size={13} aria-hidden />
    </span>
  );
}
