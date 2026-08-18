"use client";

import { cva } from "class-variance-authority";
import {
  Archive,
  Bot,
  Boxes,
  Building2,
  ChevronRight,
  Cpu,
  FileBox,
  FolderClosed,
  IdCard,
  KeyRound,
  LayoutGrid,
  Palette,
  SlidersHorizontal,
  Users,
  Wrench,
} from "lucide-react";
import type { Column, ColumnRow, RowIcon } from "./columns";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { adminCopy, type AdminDict } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// ONE COLUMN of the browser: a heading, a list of rows, and — when it has nothing of its
// own kind — the reason why.
//
// It knows nothing about agents, tenants or sections. It renders whatever `Column` it is
// handed, which is what keeps the navigation's rules in `columns.ts` where they can be
// tested instead of in a component where they cannot.

// `min-h-11` is the 44px touch target, on every row rather than a touch-only variant: a
// list whose row height changes between a phone and a desktop reads as two different
// lists.
//
// The `trail` tone that used to live here is GONE with the strip that needed it. It drew
// the selection of a column you had already moved past, so the whole path stayed readable
// across five columns; the breadcrumb is that path now, and only one column is ever drawn
// — the one whose question is still open, where nothing is selected yet.
const row = cva(
  [
    "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ],
  {
    variants: {
      state: {
        // Kept for the case a drawn column does carry a selection. The fill was corrected
        // against a screenshot once already: `bg-accent/15` on a dark background is
        // indistinguishable from `bg-elevated`, so a selection drawn that way is a
        // selection nobody can see.
        current: "bg-accent font-semibold text-accent-fg",
        idle: "text-fg hover:bg-elevated/60",
      },
      // The all-agents store is an address, not an agent. Dashed and muted so it can never
      // read as one more thing to choose between.
      tone: { normal: "", legacy: "border border-dashed border-brand/30" },
    },
    defaultVariants: { state: "idle", tone: "normal" },
  },
);

export const ROW_ICONS: Record<RowIcon, React.ReactNode> = {
  branding: <Palette size={15} aria-hidden />,
  agents: <LayoutGrid size={15} aria-hidden />,
  agent: <Bot size={15} aria-hidden />,
  legacy: <Archive size={15} aria-hidden />,
  tenant: <Building2 size={15} aria-hidden />,
  tenantWide: <Boxes size={15} aria-hidden />,
  subscription: <FolderClosed size={15} aria-hidden />,
  files: <FileBox size={15} aria-hidden />,
  secrets: <KeyRound size={15} aria-hidden />,
  skills: <Wrench size={15} aria-hidden />,
  persona: <IdCard size={15} aria-hidden />,
  model: <Cpu size={15} aria-hidden />,
  config: <SlidersHorizontal size={15} aria-hidden />,
  members: <Users size={15} aria-hidden />,
};

// A row names either something the SYSTEM owns — an agent key, a tenant or account name,
// which are identifiers and land verbatim — or a piece of prose, which is translated. The
// model returns one or the other and never both.
export function rowText(r: ColumnRow, t: AdminDict): string {
  if (r.text !== undefined) return r.text;
  switch (r.textKey) {
    case undefined:
      return "";
    case "branding":
      return t.shell.branding;
    case "agents":
      return t.columns.rows.agents;
    case "legacy":
      return t.legacyStore.entryLabel;
    case "tenantWide":
      return t.columns.rows.tenantWide;
    default:
      return t.shell.tabs[r.textKey as keyof typeof t.shell.tabs] ?? r.textKey;
  }
}

export default function ColumnView({
  column,
  onSelect,
}: {
  column: Column;
  onSelect: (row: ColumnRow) => void;
}) {
  const t = useT(adminCopy);
  const heading = t.columns.headings[column.key];

  return (
    <section
      aria-label={heading}
      // 14rem now that there is only ever one of these: the 12rem that five columns forced
      // truncated "Secundary account" and "Shared by all agents" for no reason. `snap-start`
      // went with the scrolling strip that needed it.
      //
      // Below `md` this is the WHOLE screen when no section is chosen, and hidden once one
      // is — the panel takes over there, and the two side by side left the panel with no
      // width at all. Which level you are on is then carried by the breadcrumb's
      // mobile-only tail segment.
      className="flex h-full w-full min-w-0 flex-col border-brand/20 md:w-[14rem] md:shrink-0 md:border-r"
    >
      <h2 className="shrink-0 px-2.5 pb-1.5 pt-3 font-display text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        {heading}
      </h2>

      {/* The reason, not a blank column. It sits ABOVE the rows rather than replacing them:
          an agents column with no agents still offers the legacy store, and hiding the
          rows to show the notice would take away the one thing still reachable. */}
      {column.empty && (
        <PanelEmpty className="px-2.5 py-4 text-left" title={t.columns.empty[column.empty]} />
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {column.rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              aria-current={r.selected ? "true" : undefined}
              // The affordance lives HERE, not in the chevron: the glyph is decoration and
              // is hidden from assistive technology, so a branch has to announce that it
              // opens something and whether it already did.
              aria-expanded={r.branch ? r.selected : undefined}
              title={rowText(r, t)}
              className={row({ state: r.selected ? "current" : "idle", tone: r.tone })}
            >
              <span className={"shrink-0 " + (r.selected ? "text-accent-fg" : "text-fg-muted")}>
                {ROW_ICONS[r.icon]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{rowText(r, t)}</span>
                {r.hintKey && (
                  <span
                    className={
                      "truncate text-[11px] font-normal " +
                      (r.selected ? "text-accent-fg/80" : "text-fg-muted")
                    }
                  >
                    {r.hintKey === "legacy" ? t.legacyStore.entryNote : t.columns.hints.tenantWide}
                  </span>
                )}
              </span>
              {r.branch && (
                <ChevronRight
                  size={14}
                  className={
                    "shrink-0 " + (r.selected ? "text-accent-fg" : "text-fg-muted")
                  }
                  aria-hidden
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
