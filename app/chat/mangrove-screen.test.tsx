// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The mangrove tab. What this suite asserts is the three distinctions the screen
// exists to keep apart, because collapsing any of them is the failure mode:
//
//   off        the operator never enabled it -> render NOTHING
//   empty      nobody has shared anything yet -> prose, not an error
//   unreachable the service is down -> an error, with a retry
//
// and the fourth: a member who governs nothing must not SEE the pending
// reading, rather than see it and be refused.

const readTimeline = vi.fn();
const readCapabilities = vi.fn();
const admit = vi.fn();
const decide = vi.fn();
const revoke = vi.fn();

vi.mock("@/lib/mangrove", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mangrove")>();
  return {
    ...actual,
    readTimeline: (...a: unknown[]) => readTimeline(...a),
    readCapabilities: (...a: unknown[]) => readCapabilities(...a),
    admit: (...a: unknown[]) => admit(...a),
    decide: (...a: unknown[]) => decide(...a),
    revoke: (...a: unknown[]) => revoke(...a),
  };
});

import MangroveScreen from "./mangrove-screen";
import { MangroveError } from "@/lib/mangrove";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

const workspace = { t: "t1", s: "s1", r: "alpha" as const };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MangroveScreen workspace={workspace} />);
  });
  return host.innerHTML;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe("the mangrove tab", () => {
  it("renders NOTHING when the operator never enabled the mangrove", async () => {
    readTimeline.mockRejectedValue(new MangroveError("mangrove_off"));
    readCapabilities.mockRejectedValue(new MangroveError("mangrove_off"));

    const html = await render();
    // Not an error, not an empty state with a dead button. Absent.
    expect(html).toBe("");
  });

  it("says nothing is here yet, rather than reporting a failure", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    const html = await render();
    expect(html).toContain(en.mangrove.none);
    expect(html).not.toContain(en.mangrove.unreachable);
    expect(html).not.toContain(en.mangrove.loadFailed);
  });

  it("reports an unreachable mangrove as its own state, with a retry", async () => {
    readTimeline.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    readCapabilities.mockRejectedValue(new MangroveError("mangrove_unreachable"));

    const html = await render();
    expect(html).toContain(en.mangrove.unreachable);
    expect(html).toContain(en.mangrove.retry);
    // "Nothing shared yet" would be a lie here.
    expect(html).not.toContain(en.mangrove.none);
  });

  it("does not offer the pending reading to somebody who governs nothing", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    const html = await render();
    expect(html).toContain(en.mangrove.received);
    expect(html).toContain(en.mangrove.published);
    // ABSENT, not disabled.
    expect(html).not.toContain(en.mangrove.pending);
  });

  it("offers it to a governing role", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: false });

    const html = await render();
    expect(html).toContain(en.mangrove.pending);
  });

  it("shows a directly shared item as HELD, with a way to admit it", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [],
      held: [
        {
          activityId: "mangrove:act:1",
          from: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    const html = await render();
    expect(html).toContain(en.mangrove.heldTitle);
    expect(html).toContain(en.mangrove.heldHint);
    expect(html).toContain(en.mangrove.admit);
    expect(html).toContain("6.4");
    // The bot is labelled as a bot -- it is somebody's agent, not a peer.
    expect(html).toContain("(bot)");
  });

});
