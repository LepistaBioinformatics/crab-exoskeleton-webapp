"use client";

import { cva } from "class-variance-authority";
import { Lock } from "lucide-react";
import { type LadderLevel, type LadderRung } from "@/lib/models";
import { Ident } from "./field";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// The resolution ladder.
//
// A workspace's model comes from the most specific level that has one, and the
// levels below stay set and take over when a level above is cleared. The panel
// used to show exactly ONE level at a time behind a dropdown, so an admin could
// not see what their write would override, nor what clearing it would fall back
// to. That is the same blindness the two competing model systems had before this
// feature replaced them — so drawing precedence is the fix expressed in the
// interface rather than only in the resolver.
//
// Vertical position encodes authority because in this product it literally does.
// No numbering: the order is not a sequence to follow, it is a ranking, and a rank
// is read from position.

const rung = cva(
  "grid grid-cols-[16px_1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-dashed border-brand/20 py-2 pr-2 text-left last:border-b-0",
  {
    variants: {
      tone: {
        effect: "rounded-md border-b-transparent bg-accent/10",
        overridden: "",
        empty: "",
        locked: "",
        outOfScope: "",
      },
      selectable: { true: "hover:bg-elevated/70", false: "" },
    },
    defaultVariants: { tone: "empty", selectable: false },
  },
);

const dot = cva("absolute left-[3px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-[1.5px]", {
  variants: {
    tone: {
      effect: "border-accent bg-accent",
      overridden: "border-brand/50 bg-bg",
      empty: "border-brand/30 bg-bg",
      locked: "border-brand/30 bg-bg",
      // Hollow and dashed: the level exists, but nothing about it is decided here.
      outOfScope: "border-dashed border-brand/30 bg-bg",
    },
  },
  defaultVariants: { tone: "empty" },
});

const levelText = cva("text-[13px]", {
  variants: {
    tone: {
      effect: "font-semibold text-fg",
      overridden: "font-medium text-fg-muted",
      empty: "font-medium text-fg-muted/80",
      locked: "font-medium text-fg-muted/80",
      outOfScope: "font-medium text-fg-muted/70",
    },
  },
  defaultVariants: { tone: "empty" },
});

const tag = cva("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      effect: "bg-accent text-accent-fg",
      overridden: "border border-brand/30 text-fg-muted",
      empty: "bg-elevated text-fg-muted",
      locked: "bg-elevated text-fg-muted",
      outOfScope: "border border-dashed border-brand/40 text-fg-muted",
    },
  },
  defaultVariants: { tone: "empty" },
});

type Tone = "effect" | "overridden" | "empty" | "locked" | "outOfScope";

function toneOf(r: LadderRung): Tone {
  // Both checks come before inEffect for the same reason: a rung nobody can act
  // on here must not be dressed as the one that decides.
  if (r.outOfScope) return "outOfScope";
  if (r.unreadable) return "locked";
  if (r.inEffect) return "effect";
  if (r.overridden) return "overridden";
  return "empty";
}

export function ResolutionLadder({
  rungs,
  selected,
  onSelect,
}: {
  rungs: LadderRung[];
  /** The level whose value the controls below act on. */
  selected: LadderLevel | null;
  /** Absent for the per-user rung, which is set from the pin list instead. */
  onSelect: (level: LadderLevel) => void;
}) {
  const t = useT(adminCopy);
  const tagText: Record<Tone, string> = {
    effect: t.ladder.inEffect,
    overridden: t.ladder.overridden,
    empty: t.ladder.notSet,
    locked: t.ladder.locked,
    // Deliberately vague where the detail line beside it is specific: the same
    // tag sits on the subscription rung and on the pin rung, and both are out of
    // scope for one reason — no subscription is selected — which the detail line
    // states.
    outOfScope: t.ladder.outOfScope,
  };
  return (
    <ul className="flex flex-col">
      {rungs.map((r, i) => {
        const tone = toneOf(r);
        // The per-user rung is informational: a pin is set from the pin list
        // below, one person at a time, so selecting it here would offer a control
        // that cannot exist.
        const selectable = r.level !== "user" && !r.unreadable && !r.outOfScope;
        const isSelected = selected === r.level;
        const body = (
          <>
            <span className="relative self-stretch" aria-hidden>
              <span
                className="absolute left-[7px] w-px bg-brand/30"
                style={{ top: i === 0 ? "50%" : "-8px", bottom: i === rungs.length - 1 ? "50%" : "-8px" }}
              />
              <span className={dot({ tone })} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={levelText({ tone })}>
                {r.label}
                {isSelected && (
                  <span className="ml-2 text-[11px] font-normal text-accent">{t.ladder.editing}</span>
                )}
              </span>
              <span className="truncate text-xs text-fg-muted">
                {r.unreadable ? (
                  t.ladder.unreadable
                ) : r.modelName ? (
                  <>
                    <Ident>{r.modelName}</Ident>
                    {r.detail ? ` · ${r.detail}` : ""}
                  </>
                ) : (
                  (r.detail ?? t.ladder.nothingSet)
                )}
              </span>
            </span>
            <span className="row-span-2 justify-self-end">
              <span className={tag({ tone })}>
                {tone === "locked" && <Lock size={10} aria-hidden />}
                {tagText[tone]}
              </span>
            </span>
          </>
        );

        return (
          <li key={r.level} className="contents">
            {selectable ? (
              <button
                type="button"
                className={rung({ tone, selectable: true })}
                aria-pressed={isSelected}
                onClick={() => onSelect(r.level)}
              >
                {body}
              </button>
            ) : (
              <div className={rung({ tone })}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
