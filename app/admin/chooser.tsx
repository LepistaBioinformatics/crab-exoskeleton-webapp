"use client";

import { useEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { ChevronRight } from "lucide-react";
import type { Column, ColumnRow } from "./columns";
import { ROW_ICONS, rowText } from "./column-view";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { Boxes } from "lucide-react";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// THE SELECTION CHAIN, while it is still being answered.
//
// Choosing the agent, the tenant and the subscription used to happen in a 14rem column
// pinned to the left edge — the same shape as a sidebar, which is what it read as: chrome
// beside the content rather than the thing to do. But at that moment there IS no content;
// the screen is asking a question, and nothing else is on it.
//
// So while a chain level is open it takes the middle of the screen as a list of large
// options. The sections level keeps the sidebar (see column-view.tsx): that one is switched
// repeatedly while working, so it belongs beside the panel, not in front of it.

const option = cva(
  [
    "group flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left",
    "transition-[border-color,background-color,box-shadow]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ],
  {
    variants: {
      picked: {
        true: "border-accent bg-accent/15 animate-chooser-pick",
        false: "border-brand/25 bg-elevated hover:border-brand hover:bg-elevated/70",
      },
      // The all-agents store is an address, not an agent. Dashed and quiet so it can never
      // read as one more thing to choose between.
      tone: { normal: "", legacy: "border-dashed" },
    },
    defaultVariants: { picked: false, tone: "normal" },
  },
);

// Long enough to be seen, short enough not to read as lag. The next level replaces this one
// the moment it elapses.
const PICK_MS = 150;

export default function Chooser({
  column,
  onSelect,
}: {
  column: Column;
  onSelect: (row: ColumnRow) => void;
}) {
  const t = useT(adminCopy);
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The level changed under us — a breadcrumb jump, a back navigation. Whatever was mid-
  // press belongs to the level that is gone.
  useEffect(() => {
    setPicked(null);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [column.key]);

  function choose(row: ColumnRow) {
    if (picked) return; // one press per level; a double click must not queue two navigations
    // The CSS guard neutralizes the animation under `prefers-reduced-motion`, but it cannot
    // touch this timer — leaving the pause without the animation it exists to show, which
    // is just latency. So the delay is skipped there too.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return onSelect(row);
    setPicked(row.id);
    timer.current = setTimeout(() => onSelect(row), PICK_MS);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-fg">
          {t.columns.headings[column.key]}
        </h2>
        <p className="text-sm text-fg-muted">
          {t.columns.next[column.key as keyof typeof t.columns.next]}
        </p>
      </div>

      {column.empty && (
        <PanelEmpty
          icon={Boxes}
          className="rounded-xl border border-dashed border-brand/25 px-4 py-8 text-left"
          title={t.columns.empty[column.empty]}
        />
      )}

      <ul className="flex flex-col gap-2">
        {column.rows.map((row, i) => (
          <li
            key={row.id}
            // Staggered so the level reads as a list arriving rather than a block appearing.
            // Capped: past a handful of rows the tail would just feel slow.
            className="animate-chooser-rise"
            style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}
          >
            <button
              type="button"
              onClick={() => choose(row)}
              aria-current={row.selected ? "true" : undefined}
              className={option({ picked: picked === row.id, tone: row.tone })}
            >
              <span
                className={
                  "shrink-0 " + (picked === row.id ? "text-accent" : "text-fg-muted")
                }
              >
                {ROW_ICONS[row.icon]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-medium text-fg">
                  {rowText(row, t)}
                </span>
                {row.hintKey && (
                  <span className="truncate text-xs text-fg-muted">
                    {row.hintKey === "legacy"
                      ? t.legacyStore.entryNote
                      : t.columns.hints.tenantWide}
                  </span>
                )}
              </span>
              <ChevronRight
                size={18}
                className="shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
