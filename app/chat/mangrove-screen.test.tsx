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
const publish = vi.fn();
const findPeople = vi.fn();

vi.mock("@/lib/mangrove", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mangrove")>();
  return {
    ...actual,
    readTimeline: (...a: unknown[]) => readTimeline(...a),
    readCapabilities: (...a: unknown[]) => readCapabilities(...a),
    admit: (...a: unknown[]) => admit(...a),
    decide: (...a: unknown[]) => decide(...a),
    revoke: (...a: unknown[]) => revoke(...a),
    publish: (...a: unknown[]) => publish(...a),
    findPeople: (...a: unknown[]) => findPeople(...a),
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

  // Revoke destroys, cannot be undone, and used to sit one click from the
  // content it destroys. These two assert the guard AND that the guard did not
  // become a way of hiding the control: in jsdom a closed <details> keeps its
  // contents in the DOM, so "the button still works" would pass even if it had
  // been removed from the page entirely. The structure is what has to be pinned.
  it("keeps revoke behind an advanced-options disclosure, off to the side", async () => {
    readTimeline.mockResolvedValue({
      reading: "published",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:alice:person",
          object: { id: "mangrove:obj:9", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
        },
      ],
      held: [],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    await act(async () => {
      const tab = [...host!.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === en.mangrove.published,
      );
      tab!.click();
    });

    const details = host!.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.querySelector("summary")?.textContent).toContain(en.mangrove.advanced);
    expect(details!.open).toBe(false);

    // The control is INSIDE the disclosure, not merely somewhere on the page.
    const revokeButton = [...host!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(en.mangrove.revoke),
    );
    expect(revokeButton).toBeDefined();
    expect(details!.contains(revokeButton!)).toBe(true);
  });

  it("still revokes the right claim once the disclosure is opened", async () => {
    readTimeline.mockResolvedValue({
      reading: "published",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:alice:person",
          object: { id: "mangrove:obj:9", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
        },
      ],
      held: [],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    revoke.mockResolvedValue({});

    await render();
    await act(async () => {
      const tab = [...host!.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === en.mangrove.published,
      );
      tab!.click();
    });
    await act(async () => {
      host!.querySelector("details")!.open = true;
      const b = [...host!.querySelectorAll("button")].find((x) =>
        x.textContent?.includes(en.mangrove.revoke),
      );
      b!.click();
    });

    expect(revoke).toHaveBeenCalledWith(workspace, "mangrove:obj:9", "soil-ph");
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

  // Compose is a flag beside People, NOT a reading. Made a member of the union
  // it would refetch the timeline to render a blank form, and nothing else in
  // this suite would notice.
  it("asks the timeline nothing when the compose tab is opened", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    const before = readTimeline.mock.calls.length;

    const composeTab = [...host!.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === en.mangrove.compose,
    )!;
    await act(async () => {
      composeTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host!.textContent).toContain(en.mangrove.composeHint);
    expect(readTimeline.mock.calls.length).toBe(before);
    // And the reading it was on is not rendering underneath the form.
    expect(host!.textContent).not.toContain(en.mangrove.none);
  });

  // A cross-scope publication is delivered to nobody until it is decided, so it
  // turns up in no reading. Saying "shared" would be a lie the member has no way
  // of catching.
  it("says a publication is waiting on a decision, rather than that it was shared", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: false });
    publish.mockResolvedValue({ activity: {}, pending: true });

    await render();
    await clickText(en.mangrove.compose);
    await write();
    const before = readTimeline.mock.calls.length;
    await act(async () => {
      host!
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(host!.textContent).toContain(en.mangrove.publishedPending);
    expect(host!.textContent).not.toContain(en.mangrove.publishedOk);
    // And the member is left where what they wrote will appear.
    expect(readTimeline).toHaveBeenCalledWith(expect.anything(), "published");
    // EXACTLY ONE refetch. A reload bound to the reading being left, fired
    // beside the reading change, is two in flight at once -- and the slower one
    // wins, which is this tab showing the received list under "Published".
    expect(readTimeline.mock.calls.length).toBe(before + 1);
  });

  it("says plainly that a publication landed", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    publish.mockResolvedValue({ activity: {}, pending: false });

    await render();
    await clickText(en.mangrove.compose);
    await write();
    await act(async () => {
      host!
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(host!.textContent).toContain(en.mangrove.publishedOk);
  });

});

/** Click the tab (or button) whose whole label is this. */
async function clickText(label: string) {
  const el = [...host!.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Fill the compose form's two required fields. */
async function write() {
  const cell = host!.querySelector<HTMLInputElement>(
    `[placeholder="${en.mangrove.cellPlaceholder}"]`,
  )!;
  const body = host!.querySelector("textarea")!;
  for (const [el, value] of [
    [cell, "soil-ph"],
    [body, "pH 5.2 after liming."],
  ] as const) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}
