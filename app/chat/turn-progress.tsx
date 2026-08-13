"use client";

// What the assistant band shows BEFORE the first word of the reply arrives.
//
// It replaces the bare blinking caret, which was the whole "the answer just
// sprouted" problem: picoclaw takes tens of seconds and, measured, emitted
// nothing at all for 51 of them on a tool-free turn. The text here is not
// invented -- when the agent calls a tool it narrates the call itself, in the
// user's own language ("Deixe-me buscar as informações do projeto."), and the
// proxy now forwards that instead of discarding it.
//
// The moment the first word is revealed this component is unmounted by the
// caller: progress and answer never share the band.
//
// long-turn-resilience: the line also has to look alive between events, not only
// when one arrives. Narration can be tens of seconds apart, and a band that has
// not moved in a minute reads as a frozen chat -- so the text shimmers on its own
// clock, and once the turn is no longer brief it says how long it has been quiet.
// A number that visibly advances is the strongest available evidence that nothing
// is stuck.

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import { Brain, Loader2, Wrench } from "lucide-react";
import { SILENCE_GRACE_MS, type Progress } from "@/app/chat/turn-store";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// Reasoning is not an action -- a thought and a tool call must not read the
// same. The tool line is the louder of the two: it says the agent is doing
// something in the world.
//
// `stalled` is orthogonal to `kind`: it says the line has stopped changing, not
// what it is.
export const progressLine = cva(
  "flex items-center gap-2 text-sm transition-opacity duration-500 motion-reduce:transition-none",
  {
    variants: {
      kind: {
        tool: "text-fg-muted",
        thought: "text-fg-muted/70 italic",
        waiting: "text-fg-muted/60",
        // Louder than `waiting`: it reports something that happened, not just that
        // we are still here.
        recovering: "text-fg-muted",
      },
      stalled: {
        true: "progress-stalled",
        false: "",
      },
    },
    defaultVariants: { kind: "waiting", stalled: false },
  },
);

/** "45s", "1m 05s" -- units only, so both locales read it the same. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Milliseconds since `from`, recomputed every second. One interval per band; it
 * restarts whenever `from` moves, which for the progress line means every event.
 */
function useElapsed(from: number): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(Date.now() - from);
    const timer = setInterval(() => setElapsed(Date.now() - from), 1000);
    return () => clearInterval(timer);
  }, [from]);
  return elapsed;
}

// Whether a progress line should breathe rather than sit still.
//
// A narrated line is painted once and then holds for as long as the agent stays
// inside one tool call -- picoclaw's "Continuing the current task.: ..." can own
// the band for minutes.
//
// This overlaps with the shimmer and the elapsed readout below, which came from
// long-turn-resilience and answer the same complaint. Both are kept by decision:
// the line-level pulse is the coarsest of the three and the only one visible
// without reading, at the cost of dimming the other two as it dips, since it
// acts on their container.
//
// The `waiting` line is deliberately excluded: it already swaps its own text at
// SILENCE_GRACE_MS (thinking -> working), and pulsing it at the same instant it
// changes would contradict what the pulse means.
export function stalledPulse(
  kind: "tool" | "thought" | "waiting",
  silent: boolean,
): boolean {
  return silent && kind !== "waiting";
}

export default function TurnProgress({
  progress,
  lastEventAt,
}: {
  progress: Progress | null;
  /** Timestamp of the last event, for the silence fallback and the readout. */
  lastEventAt: number;
}) {
  const t = useT(chatCopy);
  // The agent can go quiet for a long time inside a single LLM call. Without
  // this the last event freezes on screen and it looks hung again -- the exact
  // symptom this band exists to remove. Derived from the elapsed clock rather
  // than its own timeout, so the fallback text and the readout it appears with
  // cannot disagree about how long the silence has been.
  const quietFor = useElapsed(lastEventAt);
  const silent = quietFor >= SILENCE_GRACE_MS;

  // `typing` frames carry no text; they only say the agent is alive.
  const narrated = progress && progress.kind !== "typing" && progress.text !== "";
  const toolName = progress?.tool;

  let kind: "tool" | "thought" | "waiting" = "waiting";
  let text = t.view.thinking;
  let Icon = Loader2;

  if (narrated) {
    kind = progress.kind === "thought" ? "thought" : "tool";
    text = progress.text;
    Icon = progress.kind === "thought" ? Brain : Wrench;
  } else if (toolName) {
    // The narration is model-generated, so it is sometimes absent. Naming the
    // tool is still far better than a spinner.
    kind = "tool";
    text = t.view.usingTool.replace("{tool}", toolName);
    Icon = Wrench;
  } else if (silent) {
    text = t.view.working;
  }

  return (
    <div
      // Keying on the text remounts the node, so each new event fades in
      // instead of swapping hard. Without this the band flickers as events
      // replace one another.
      key={text}
      className={progressLine({ kind, stalled: stalledPulse(kind, silent) })}
      aria-live="polite"
    >
      <Icon
        size={14}
        aria-hidden
        // The spinner already moves; a static icon breathes instead, so no state
        // of this band is ever completely still.
        className={
          Icon === Loader2
            ? "animate-spin motion-reduce:animate-none"
            : "animate-pulse motion-reduce:animate-none"
        }
      />
      <span className="progress-shimmer animate-fade-in motion-reduce:animate-none">{text}</span>
      {/* Only once the turn is no longer brief: on a fast turn the number would be
          noise, and it would appear and vanish before it could be read. */}
      {silent && (
        <span className="tabular-nums text-xs opacity-60">{formatElapsed(quietFor)}</span>
      )}
    </div>
  );
}

/**
 * The stream was cut and the reply is being recovered from the transcript.
 *
 * Its own component rather than another state of `TurnProgress`, because the caller
 * renders it in BOTH arms of the band: in place of progress when nothing arrived
 * yet, and beneath a partially revealed reply when the cut came mid-answer. There
 * is no progress to show either way -- the source of progress is what went away.
 */
export function TurnRecovery({ since }: { since: number }) {
  const t = useT(chatCopy);
  const elapsed = useElapsed(since);
  return (
    <div className={progressLine({ kind: "recovering" })} aria-live="polite">
      <Loader2 size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />
      <span className="progress-shimmer animate-fade-in motion-reduce:animate-none">
        {t.view.recovering}
      </span>
      <span className="tabular-nums text-xs opacity-60">{formatElapsed(elapsed)}</span>
    </div>
  );
}
