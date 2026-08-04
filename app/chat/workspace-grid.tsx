"use client";

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import { Bot, Eye, FolderClosed, Pencil } from "lucide-react";
import { createConversation } from "@/lib/chatSession";
import { type AgentLeaf } from "@/lib/subscriptions";
import { setWorkspace, type Workspace } from "./fragment";
import { useTenantBranding } from "./tenant-brand";
import { useWorkspaceGroups } from "./use-workspaces";
import EmptyState from "./empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { TenantAvatar } from "@/components/ui/avatar";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The content pane when no workspace is chosen: every workspace the member can reach.
//
// It exists because the alternative was a welcome message pointing at a sidebar that
// is collapsed on narrow screens — the member had to find the way in before they could
// use anything. Here the way in IS the screen.
//
// Layout mirrors the hierarchy: one ROW per tenant, one BOX per subscription in that
// row, and the agents as square tiles inside their box. So scanning across is "which
// subscription", scanning down is "which tenant" — the two questions a member actually
// has. The row is a wrapping grid rather than a real flex row, so on a phone the boxes
// stack instead of squeezing.
//
// The workspace list comes from useWorkspaceGroups, shared with the sidebar and the
// shell — the list is cheap enough to fetch per screen, but how a 401 is handled must
// not differ between them.

// An agent as a square tile rather than a list row. A subscription usually holds a
// handful of agents, and a tile gives the name room to be read at a glance instead of
// competing with the permission icons on one line.
const agentTile = cva(
  "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-brand/25 p-2 text-center transition-colors hover:border-accent/60 hover:bg-elevated disabled:opacity-60",
);

export default function WorkspaceGrid() {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  // The shared hook, not a local fetch. The private copy this file started with had
  // already drifted on the thing that matters least visibly: it had no 401 branch, so a
  // session that expired while this screen was open showed a generic error instead of
  // sending the member to sign in.
  const { groups, error } = useWorkspaceGroups();
  const [entering, setEntering] = useState(false);
  const { names, brands } = useTenantBranding(groups);

  // Same entry path the sidebar tree uses: a workspace is entered through a fresh
  // conversation, so the chat has something to be.
  async function pick(leaf: AgentLeaf) {
    if (entering) return;
    setEntering(true);
    const workspace: Workspace = { t: leaf.tenantId, s: leaf.subsAccId, r: leaf.role };
    try {
      const conversation = await createConversation(workspace);
      setWorkspace(workspace, conversation.id);
    } finally {
      setEntering(false);
    }
  }

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-xl font-bold text-fg sm:text-2xl">
          {t.workspaceGrid.title}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">{t.workspaceGrid.body}</p>

        <div className="mt-6 space-y-8">
          {groups.map((tenant) => (
            <section key={tenant.tenantId}>
              <div className="flex items-center gap-2 border-b border-brand/25 pb-2">
                <TenantAvatar
                  name={names[tenant.tenantId] ?? tenant.tenantId}
                  logo={brands[tenant.tenantId]?.logo}
                  color={brands[tenant.tenantId]?.color}
                />
                {/* The uuid until its name lands, then the name. Never blocks. */}
                <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold text-fg sm:text-lg">
                  {names[tenant.tenantId] ?? tenant.tenantId}
                </h2>
              </div>

              {/* The tenant's row of subscription boxes. Wraps rather than squeezing:
                  this pane shares the viewport with two sidebars and is resizable. */}
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tenant.accounts.map((account) => (
                  <li
                    key={account.subsAccId}
                    className="rounded-xl border border-brand/30 bg-surface p-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <FolderClosed
                        size={16}
                        className="shrink-0 text-fg-muted"
                        aria-hidden
                      />
                      <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-fg">
                        {account.accName?.trim() || account.subsAccId}
                      </h3>
                    </div>

                    <ul className="mt-3 grid grid-cols-2 gap-2">
                      {account.agents.map((leaf) => (
                        <li key={`${leaf.subsAccId}|${leaf.role}`} className="min-w-0">
                          <button
                            type="button"
                            disabled={entering}
                            onClick={() => pick(leaf)}
                            className={agentTile()}
                          >
                            <Bot size={22} className="text-accent" aria-hidden />
                            <span className="w-full truncate text-sm font-semibold capitalize text-fg">
                              {leaf.role}
                            </span>
                            <AccessIcons perms={leaf.perms} t={t} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The permission union as icons — an eye for read, a pencil for write.
 *
 * Icons rather than the "read·write" wording the sidebar uses: in a card this dense the
 * words outweighed the agent's own name. Each still carries its word as a label and a
 * tooltip, so the meaning is available to a screen reader and on hover rather than
 * being left to the reader to infer from a glyph.
 */
function AccessIcons({
  perms,
  t,
}: {
  perms: string[];
  t: typeof chatCopy.en;
}) {
  const set = new Set(perms.map((p) => p.toLowerCase()));
  return (
    <span className="flex shrink-0 items-center gap-1 text-fg-muted">
      {/* The wrapper carries the label and the tooltip: lucide icons take neither. */}
      {set.has("read") && (
        <span role="img" aria-label={t.workspaceGrid.permRead} title={t.workspaceGrid.permRead}>
          <Eye size={13} aria-hidden />
        </span>
      )}
      {set.has("write") && (
        <span role="img" aria-label={t.workspaceGrid.permWrite} title={t.workspaceGrid.permWrite}>
          <Pencil size={13} aria-hidden />
        </span>
      )}
    </span>
  );
}
