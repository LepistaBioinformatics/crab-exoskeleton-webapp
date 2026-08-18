import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chatCopy } from "@/lib/i18n/chat";

// Source, not a render. ChatView has no render test anywhere in this suite — it pulls in the
// composer, the markdown pipeline, the uploads sidebar and the secrets drawer — and the
// precedent for asserting one structural decision inside a component that size is
// mobile-keyboard-viewport.test.ts, which reads chat-shell.tsx the same way.
//
// What that leaves untested is honest to state: nothing here proves the button APPEARS at the
// right moment in a browser. The pure part of the behaviour — which message the jump lands on
// — is `landingIndex`, and message-rows.test.ts covers it, including the empty conversation
// that makes this a safe no-op rather than a crash.
const src = readFileSync(new URL("./chat-view.tsx", import.meta.url), "utf8");

describe("jump to the latest message", () => {
  // The bug this guards is a button that works exactly once. `scrollToIndex` is state with no
  // reset, so clicking a second time on the same target sets an unchanged value and the effect
  // watching it never fires again.
  it("scrolls directly instead of going through the scrollToIndex state", () => {
    const handler = src.slice(src.indexOf("const scrollToLatest"), src.indexOf("const scrollToLatest") + 400);
    expect(handler).toContain("scrollIntoView");
    expect(handler).not.toContain("setScrollToIndex");
  });

  it("lands on the last thing actually said, skipping trailing steps", () => {
    const handler = src.slice(src.indexOf("const scrollToLatest"), src.indexOf("const scrollToLatest") + 400);
    expect(handler).toContain("landingIndex(messages)");
    // Same block alignment as every other scroll in this view; `end` would put the message
    // under the floating composer.
    expect(handler).toContain('block: "start"');
  });

  // The scroll area carries `pb-[80vh]`, so scrollHeight is most of a viewport taller than the
  // messages. Distance-from-bottom arithmetic would report "not at the end" for a member
  // looking straight at the newest message.
  it("decides visibility from a sentinel, not from scroll arithmetic", () => {
    expect(src).toContain("IntersectionObserver");
    expect(src).toContain("attachEndSentinel");
    // Comments stripped: the only mention of scrollHeight in this file is the comment saying
    // why it is NOT used, and asserting over the raw text would trip on the explanation.
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain("scrollHeight");
  });

  // The sentinel has to sit ABOVE the 80vh pad — inside the content column — or it only
  // becomes visible once the member scrolls past the end of the messages into empty space.
  it("puts the sentinel inside the content column, not after the scroll pad", () => {
    const scroller = src.indexOf('className="absolute inset-0 overflow-auto');
    const sentinel = src.indexOf("ref={attachEndSentinel}");
    const composer = src.indexOf("The composer floats, suspended over the chat");
    expect(scroller).toBeGreaterThan(-1);
    expect(sentinel).toBeGreaterThan(scroller);
    expect(sentinel).toBeLessThan(composer);
  });

  // The composer's textarea grows as you type. A button at a fixed offset from the bottom
  // collides with it; a button in the composer's own column is pushed up by it.
  it("sits inside the composer's column so it tracks the composer's height", () => {
    const floating = src.slice(src.indexOf("The composer floats, suspended over the chat"));
    const button = floating.indexOf("scrollToLatest");
    const composerSlot = floating.indexOf("{composer}");
    expect(button).toBeGreaterThan(-1);
    expect(button).toBeLessThan(composerSlot);
  });

  // THE bug this file exists to prevent, and it shipped in the first draft. The sentinel lives
  // in only one of ChatView's three branches, so on every conversation open the order is: sid
  // changes, the loading spinner renders, an effect keyed on [sessionId] runs against a null
  // ref and bails, history arrives, the sentinel mounts -- and the effect never re-runs. The
  // button never appeared, for any conversation. A callback ref is driven by the node mounting.
  it("attaches the observer with a callback ref, not an effect that can miss the mount", () => {
    expect(src).toContain("const attachEndSentinel = useCallback(");
    expect(src).toContain("ref={attachEndSentinel}");
    // The observer must be constructed inside the callback, not in an effect keyed on the
    // conversation -- which is what missed the mount.
    const attach = src.slice(
      src.indexOf("const attachEndSentinel"),
      src.indexOf("useEffect(() => () => observerRef.current?.disconnect()"),
    );
    expect(attach).toContain("new IntersectionObserver");
  });

  it("renders nothing while the newest message is on screen", () => {
    expect(src).toContain("{!atLatest && (");
  });

  it("takes its copy from the dict, in both locales", () => {
    expect(src).toContain("t.view.scrollToLatest");
    expect(chatCopy.en.view.scrollToLatest).toBeTruthy();
    expect(chatCopy.pt.view.scrollToLatest).toBeTruthy();
    expect(chatCopy.pt.view.scrollToLatest).not.toBe(chatCopy.en.view.scrollToLatest);
  });
});
