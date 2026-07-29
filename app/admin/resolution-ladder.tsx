"use client";

import { cva } from "class-variance-authority";
import { ArrowDown, Lock } from "lucide-react";
import { rungSelectable, type LadderLevel, type LadderRung } from "@/lib/models";
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
//
// Drawn widest-first, narrowing downward, even though the resolver decides in the
// opposite order. A ranking has no inherent reading direction, and an admin asked
// which end to start from — so the ladder now flows the way the word cascade
// implies: the global net at the top, each level below it covering fewer people
// and overriding the one above, the individual at the bottom. That also puts the
// pin rung next to the per-person list that edits it, which is the same fact in
// two places rather than two boxes.
//
// The cost is that the answer is no longer the first line. The caps below carry
// the direction, and the section's own summary keeps stating the winner in plain
// text for anyone who only wants that.

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
        notEditable: "",
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
      // Solid outline, no fill: the level is real and READ — its value is on the
      // rung — it is simply not written from this screen.
      notEditable: "border-brand/40 bg-bg",
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
      notEditable: "font-medium text-fg-muted",
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
      notEditable: "border border-brand/30 text-fg-muted",
    },
  },
  defaultVariants: { tone: "empty" },
});

type Tone = "effect" | "overridden" | "empty" | "locked" | "outOfScope" | "notEditable";

function toneOf(r: LadderRung): Tone {
  // outOfScope wins over notEditable where a rung is both: it carries the more
  // specific message ("select a subscription") against the general one.
  if (r.outOfScope) return "outOfScope";
  if (r.unreadable) return "locked";
  // inEffect stays AHEAD of notEditable. Which level decides is the ladder's
  // central fact, and a global default that happens to be the winner has to read
  // as the winner — marking it "not editable here" instead would leave no rung
  // showing in effect at all, which is the ladder saying something false. That the
  // rung cannot be written is carried by it not being selectable.
  if (r.inEffect) return "effect";
  if (r.notEditable) return "notEditable";
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
    notEditable: t.ladder.notEditable,
  };
  return (
    <div className="flex flex-col">
      {/* The direction, stated before the first rung rather than inferred from
          it. The arrow repeats it in form for anyone scanning past the text. */}
      <p className="flex items-start gap-1.5 pb-1.5 text-[11px] text-fg-muted">
        <ArrowDown size={12} aria-hidden className="mt-px shrink-0" />
        <span className="max-w-[56ch]">{t.ladder.readDown}</span>
      </p>
      <ul className="flex flex-col">
      {rungs.map((r, i) => {
        const tone = toneOf(r);
        // Selectable = this screen writes it. The pin rung is included when the
        // rail sits on a subscription: selecting it swaps the editor below for the
        // per-person list, and those people are inside the selected subscription.
        // The agent and global rungs are never selectable, whatever the rail says.
        //
        // The rule lives in models.ts, not here. This component draws a decision it
        // does not own — and the panel re-checks it on receipt, because a
        // presentational component must not be the only thing between a click and a
        // write to the wrong scope.
        const selectable = rungSelectable(r);
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
      {/* The conclusion of the sentence the top cap starts, sitting under the rail
          it describes. Aligned to the rail's own x so it reads as its terminus. */}
      <p className="relative pl-[26px] pt-1.5 text-[11px] text-fg-muted">
        <ArrowDown size={12} aria-hidden className="absolute left-[1.5px] top-1 text-brand/60" />
        {t.ladder.winnerNote}
      </p>
    </div>
  );
}
