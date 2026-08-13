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
      },
      stalled: {
        true: "progress-stalled",
        false: "",
      },
    },
    defaultVariants: { kind: "waiting", stalled: false },
  },
);

// Whether a progress line should breathe rather than sit still.
//
// A narrated line is painted once and then holds for as long as the agent stays
// inside one tool call -- picoclaw's "Continuing the current task.: ..." can own
// the band for minutes. Nothing about it changes, so it reads as a hung chat
// rather than a working one.
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
  /** Timestamp of the last event, for the silence fallback. */
  lastEventAt: number;
}) {
  const t = useT(chatCopy);
  const [silent, setSilent] = useState(false);

  // The agent can go quiet for a long time inside a single LLM call. Without
  // this the last event freezes on screen and it looks hung again -- the exact
  // symptom this band exists to remove.
  useEffect(() => {
    setSilent(false);
    const timer = setTimeout(() => setSilent(true), SILENCE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [lastEventAt]);

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
        className={Icon === Loader2 ? "animate-spin motion-reduce:animate-none" : ""}
      />
      <span className="animate-fade-in motion-reduce:animate-none">{text}</span>
    </div>
  );
}
