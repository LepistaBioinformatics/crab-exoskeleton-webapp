import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import TurnProgress, { TurnRecovery, formatElapsed } from "./turn-progress";
import { chatCopy } from "@/lib/i18n/chat";

// long-turn-resilience. The band has to look alive between events, not only when one
// arrives: the agent's narration can be tens of seconds apart, and a band that has
// not moved in a minute reads as a frozen chat.
//
// The suite runs `environment: "node"`, so effects never fire and no test here can
// observe the elapsed readout appearing after the grace window, or the shimmer
// actually sweeping. What IS mechanical is checked below — the formatter, and the
// markup carrying the class that animates. The timing itself is verified by watching
// a real long turn; see tasks.md.

const en = chatCopy.en.view;

describe("formatElapsed", () => {
  it("reads in seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45_400)).toBe("45s");
  });

  it("pads the seconds once there are minutes, so the width stops jumping", () => {
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(680_000)).toBe("11m 20s");
  });

  it("never goes backwards past zero", () => {
    // `Date.now() - from` can land negative for one tick if the store stamps a
    // timestamp a hair ahead of the render.
    expect(formatElapsed(-2_000)).toBe("0s");
  });
});

// The shimmer is the one piece of this component that can make the line
// UNREADABLE rather than merely ugly, and the markup assertions above cannot see
// it: they prove the class is on the span, not that the span is still painted.
//
// It has already failed exactly once, in the shape below -- the sweep was a
// gradient clipped to the glyphs, so the rule had to set `color: transparent`,
// and the gradient it was built from used `currentColor`. On the same element
// that resolves to the transparent colour just set, so every thinking line
// rendered in the page's own background colour.
describe(".progress-shimmer", () => {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
  const rule = css.slice(css.indexOf(".progress-shimmer {"), css.indexOf("}", css.indexOf(".progress-shimmer {")));

  it("is a real rule, so the assertions below are not vacuous", () => {
    expect(rule).toContain("animation: progressShimmer");
  });

  it("never blanks the text colour it is supposed to sweep", () => {
    expect(rule).not.toMatch(/color:\s*transparent/);
  });

  it("does not paint the glyphs from a background, which is what forced that", () => {
    expect(rule).not.toContain("background-clip: text");
  });
});

describe("TurnProgress", () => {
  it("animates the waiting line without waiting for an event", () => {
    const html = renderToStaticMarkup(<TurnProgress progress={null} lastEventAt={Date.now()} />);
    expect(html).toContain(en.thinking);
    expect(html).toContain("progress-shimmer");
  });

  it("holds the readout back on a turn that has only just started", () => {
    const html = renderToStaticMarkup(<TurnProgress progress={null} lastEventAt={Date.now()} />);
    // On a fast turn the number would be noise, appearing and vanishing before it
    // could be read.
    expect(html).not.toContain("tabular-nums");
  });

  it("names the tool when the agent did not narrate the call", () => {
    const html = renderToStaticMarkup(
      <TurnProgress progress={{ kind: "tool", text: "", tool: "web_fetch" }} lastEventAt={Date.now()} />,
    );
    expect(html).toContain("Using web_fetch");
  });
});

describe("TurnRecovery", () => {
  it("says the connection dropped and that the agent is still working", () => {
    const html = renderToStaticMarkup(<TurnRecovery since={Date.now()} />);
    expect(html).toContain(en.recovering);
    // Not disguised as ordinary progress, and not silent: the member is waiting on a
    // different thing now.
    expect(html).not.toContain(en.thinking);
  });

  it("carries an elapsed readout from the first render", () => {
    // Unlike the progress line there is no grace period: by the time this shows, the
    // turn has already outlived a whole stream.
    const html = renderToStaticMarkup(<TurnRecovery since={Date.now()} />);
    expect(html).toContain("tabular-nums");
    expect(html).toContain("progress-shimmer");
  });
});
