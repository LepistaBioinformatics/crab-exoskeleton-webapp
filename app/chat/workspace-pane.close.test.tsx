// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import WorkspacePane from "./workspace-pane";

// THE PANE LEAVING, which for a long time it did in a single frame while arriving took
// 200ms. The asymmetry was structural rather than cosmetic: `rs` clears on the click, so
// the <aside> was out of the tree before any exit could run. The shell now holds the
// section for the length of the animation and this is the contract between the two — the
// class that plays the exit, and the event that says the pane may go.
//
// jsdom because both halves are about a LIVE element: a first-paint assertion can see the
// class but never the animationend that ends the exit.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(props: { closing?: boolean; onClosed?: () => void }) {
  act(() => {
    root!.render(
      <WorkspacePane title="Files" onClose={() => {}} {...props}>
        <div data-testid="body">files</div>
      </WorkspacePane>,
    );
  });
  return host!.querySelector("aside")!;
}

function mount(props: { closing?: boolean; onClosed?: () => void } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  return render(props);
}

function animationEnd(el: Element) {
  act(() => {
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
  });
}

describe("the pane's exit", () => {
  it("plays the opening animation while it is open", () => {
    const aside = mount();
    expect(aside.className).toContain("pane-open");
    expect(aside.className).not.toContain("pane-close");
  });

  it("swaps to the closing animation once the shell says it is leaving", () => {
    const aside = mount({ closing: true });
    expect(aside.className).toContain("pane-close");
    expect(
      aside.className,
      "both at once and the element restarts at width 0 instead of shrinking from its own",
    ).not.toContain("pane-open");
  });

  // Nothing else can end the exit. A timer would have to guess the duration, and the
  // reduced-motion guard in globals.css makes that guess wrong by two orders of
  // magnitude — an instant animation followed by 200ms of dead pane.
  it("tells the shell it may go when its own animation ends", () => {
    const onClosed = vi.fn();
    const aside = mount({ closing: true, onClosed });
    expect(onClosed).not.toHaveBeenCalled();
    animationEnd(aside);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  // A spinner, a fading row, anything inside the pane that animates: its animationend
  // bubbles through the aside, and without the target check one of them would drop the
  // pane halfway out.
  it("ignores an animation that finished inside it", () => {
    const onClosed = vi.fn();
    mount({ closing: true, onClosed });
    animationEnd(host!.querySelector("[data-testid=body]")!);
    expect(onClosed).not.toHaveBeenCalled();
  });

  // Re-opening the section before the exit finishes. `pane-open` animates width from
  // ZERO, so putting it back on an element that is already on screen does not resume the
  // pane — it collapses it to nothing and grows it again, which is a worse frame than the
  // one it was meant to smooth. The arrival plays on a mount and nowhere else.
  it("does not replay the arrival when the member re-opens it mid-exit", () => {
    mount({ closing: true });
    const aside = render({ closing: false });
    expect(aside.className).not.toContain("pane-close");
    expect(
      aside.className,
      "replaying the arrival restarts the width at zero on a pane that is already open",
    ).not.toContain("pane-open");
  });

  it("never reports a close while it is open", () => {
    const onClosed = vi.fn();
    const aside = mount({ onClosed });
    animationEnd(aside);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
