// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const mergeFragment = vi.fn();
const downloadBlob = vi.fn();
const readIdentity = vi.fn();
const shareWith = vi.fn();

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
    mergeFragment: (...a: unknown[]) => mergeFragment(...a),
    downloadBlob: (...a: unknown[]) => downloadBlob(...a),
    readIdentity: (...a: unknown[]) => readIdentity(...a),
    shareWith: (...a: unknown[]) => shareWith(...a),
  };
});

import MangroveScreen from "./mangrove-screen";
import { requestMangroveShare, takePendingShare } from "./mangrove-share-bus";
import { GRAPH_FRAGMENT_MEDIA_TYPE, MangroveError } from "@/lib/mangrove";
import { buildReferenceMarker, type ChatReference } from "@/lib/chatReference";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

const workspace = { t: "t1", s: "s1", r: "alpha" as const };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const referenced: ChatReference[] = [];

/** The member, as the mangrove knows them. */
const ME = {
  email: "me@example.test",
  personId: "mangrove:actor:me:person",
  serviceId: "mangrove:actor:me:service",
};

// Every fixture below is authored by somebody who is NOT the member unless it says
// otherwise, so nothing turns into "your own post" by accident.
beforeEach(() => {
  readIdentity.mockResolvedValue(ME);
});

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MangroveScreen workspace={workspace} onReference={(ref) => referenced.push(ref)} />,
    );
  });
  return host.innerHTML;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  referenced.length = 0;
  // The bus parks a share until somebody takes it, so one left behind by a test would
  // open the next test's composer.
  takePendingShare();
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
    // Somebody's AGENT, not a peer -- said in words, with the id it is the only
    // handle for kept beside them.
    expect(html).toContain(`${en.mangrove.actorAgent} (bob)`);
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

// What a timeline object can now BE, and the three readings of it that must not collapse
// into one. A file has no body, a fragment's body is JSON, and prose is prose — a screen
// that only looked at `content` would show the first as an empty memory and the second as
// a wall of braces.

const FRAGMENT_BODY = JSON.stringify({
  entities: [
    {
      name: "Rhizophora",
      entityType: "species",
      observations: [
        { content: "salt-tolerant", timestamp: 1 },
        { content: "prop roots", timestamp: 2 },
      ],
    },
    { name: "Mangrove", entityType: "habitat", observations: [{ content: "tidal", timestamp: 3 }] },
  ],
  relations: [{ from: "Rhizophora", to: "Mangrove", relationType: "grows_in" }],
});

function claimOf(object: Record<string, unknown>) {
  return {
    reading: "received",
    claims: [
      {
        cell: (object.cell as string) ?? "soil-ph",
        author: "mangrove:actor:bob:service",
        object,
        published: "2026-09-22T10:00:00Z",
        deleted: false,
        evidence: 0,
        audience: [],
      },
    ],
    held: [],
  };
}

describe("a shared graph fragment", () => {
  const FRAGMENT = {
    id: "mangrove:obj:frag",
    type: "MemoryNote",
    cell: "mangroves",
    mediaType: GRAPH_FRAGMENT_MEDIA_TYPE,
    content: FRAGMENT_BODY,
  };

  it("renders the entity names and the counts, not the JSON", async () => {
    readTimeline.mockResolvedValue(claimOf(FRAGMENT));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    const text = host!.textContent!;
    expect(text).toContain(en.mangrove.fragmentTitle);
    expect(text).toContain("Rhizophora");
    expect(text).toContain("Mangrove");
    // 2 entities, 3 observations between them, 1 relation.
    expect(text).toContain(
      en.mangrove.fragmentCounts
        .replace("{entities}", "2")
        .replace("{observations}", "3")
        .replace("{relations}", "1"),
    );
    // The body itself is nowhere on screen: a reader deciding whether to merge is
    // served by names and counts, not by the serialization they arrived in.
    expect(text).not.toContain("entityType");
    expect(text).not.toContain("prop roots");
  });

  it("falls back to showing the body when it does not parse", async () => {
    readTimeline.mockResolvedValue(
      claimOf({ ...FRAGMENT, content: "{ truncated" }),
    );
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    // No claim about entities it could not read -- and the bytes, whatever they are.
    expect(host!.textContent).not.toContain(en.mangrove.fragmentTitle);
    expect(host!.textContent).toContain("truncated");
  });

  it("reports the three counts a merge landed", async () => {
    readTimeline.mockResolvedValue(claimOf(FRAGMENT));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    mergeFragment.mockResolvedValue({
      entitiesCreated: 2,
      observationsAdded: 3,
      relationsCreated: 1,
    });

    await render();
    await clickText(en.mangrove.merge);

    expect(mergeFragment).toHaveBeenCalledWith(expect.anything(), "mangrove:obj:frag");
    expect(host!.textContent).toContain(
      en.mangrove.merged
        .replace("{entities}", "2")
        .replace("{observations}", "3")
        .replace("{relations}", "1"),
    );
  });

  it("says so when a merge landed nothing at all", async () => {
    readTimeline.mockResolvedValue(claimOf(FRAGMENT));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    mergeFragment.mockResolvedValue({
      entitiesCreated: 0,
      observationsAdded: 0,
      relationsCreated: 0,
    });

    await render();
    await clickText(en.mangrove.merge);

    // A control that merely stopped being busy would read as a failure.
    expect(host!.textContent).toContain(en.mangrove.mergedNothing);
  });
});

describe("a shared file", () => {
  const FILE = {
    id: "mangrove:obj:file",
    type: "MemoryNote",
    cell: "q2-report",
    blob: "a".repeat(64),
    fileName: "q2.pdf",
    size: 2048,
  };

  it("offers the bytes by name and size, rather than an empty memory", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    expect(host!.textContent).toContain("q2.pdf");
    expect(host!.textContent).toContain("2 KB");
    expect(host!.textContent).toContain(en.mangrove.downloadFile);
  });

  it("downloads by DIGEST, which is the only handle the bytes have", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    downloadBlob.mockResolvedValue(undefined);

    await render();
    await clickLabel(`${en.mangrove.downloadFile} — q2.pdf`);

    expect(downloadBlob).toHaveBeenCalledWith(expect.anything(), FILE.blob, "q2.pdf");
  });
});

describe("referencing a memory in the chat", () => {
  const PROSE = {
    id: "mangrove:obj:prose",
    type: "MemoryNote",
    cell: "soil-ph",
    content: "pH 5.2 after liming.",
    mediaType: "text/markdown",
  };

  it("hands up the OBJECT ID, which is what the agent resolves", async () => {
    readTimeline.mockResolvedValue(claimOf(PROSE));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    await clickLabel(`${en.mangrove.reference} — soil-ph`);

    expect(referenced).toEqual([
      {
        kind: "mangrove",
        objectId: "mangrove:obj:prose",
        cell: "soil-ph",
        // The chip and the marker are both prose for a reader, which is why the
        // humanised label travels and the raw id does not: `objectId` is what
        // anything resolves by.
        author: `${en.mangrove.actorAgent} (bob)`,
      },
    ]);
    // The marker that actually travels carries it too -- a chip with the id and a
    // message without one would leave the agent nothing to look up.
    expect(buildReferenceMarker(referenced[0], en)).toContain("mangrove:obj:prose");
    // And the click is answered on THIS screen, because the composer it filled is not
    // on it.
    expect(host!.textContent).toContain(en.mangrove.referenced);
  });
});

describe("a share asked for from somewhere else", () => {
  it("opens the composer with the file already attached", async () => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    // Published BEFORE this screen exists, which is the real sequence: the files pane
    // is beside the conversation and the click is what navigates here.
    requestMangroveShare({ kind: "file", path: "reports/q2.pdf", name: "q2.pdf" });

    await render();
    expect(host!.textContent).toContain(en.mangrove.attachedFile);
    expect(host!.textContent).toContain("q2.pdf");
    // And the prose form is not underneath it.
    expect(host!.querySelector("textarea")).toBeNull();
  });
});

/** Click the control whose accessible name is this. */
async function clickLabel(label: string) {
  const el = host!.querySelector(`[aria-label="${label}"]`)!;
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// THE READING IS A LIST OF CARDS, AND THE ORDER IS A DECISION.
//
// What these pin down is the part that is easy to get accidentally right: a fixture
// that is already in order passes against a screen that never sorts, and a card that
// opens the sheet is worth nothing if it also opens when the member meant to press
// Download. Both are asserted against the rendered list, not against the helper --
// a green `newestFirst` says nothing about whether the screen calls it.

const LONG_BODY = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");

function claimsOf(...cells: { cell: string; published: string; content?: string }[]) {
  return {
    reading: "received",
    claims: cells.map((c) => ({
      cell: c.cell,
      author: "mangrove:actor:alice:person",
      object: {
        id: `mangrove:obj:${c.cell}`,
        type: "MemoryNote",
        cell: c.cell,
        content: c.content ?? LONG_BODY,
        mediaType: "text/markdown",
      },
      published: c.published,
      deleted: false,
      evidence: 0,
      audience: [],
    })),
    held: [],
  };
}

/** The cards on screen, in the order they are rendered. */
function cards(): HTMLLIElement[] {
  return [...host!.querySelectorAll("li")];
}

describe("the reading, as a list of cards", () => {
  const SHUFFLED = [
    { cell: "third", published: "2026-03-02T09:00:00Z" },
    { cell: "fifth", published: "2026-01-01T00:00:00Z" },
    { cell: "first", published: "2026-09-22T10:00:00Z" },
    { cell: "fourth", published: "2026-03-01T09:00:00Z" },
    { cell: "second", published: "2026-06-15T23:59:59Z" },
  ];

  it("renders them most recent first, whatever order they arrived in", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    // The cell is in each card's meta line, so the cards' own text is the order.
    const order = cards().map((li) => li.querySelector("p")!.textContent!.split(" ·")[0]);
    expect(order).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  it("marks out exactly the three most recent", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    const recent = [...host!.querySelectorAll('[data-recent="true"]')];
    expect(recent.length).toBe(3);
    // The three at the TOP, which is what "most recent" means once the list is sorted.
    expect(recent).toEqual(cards().slice(0, 3));
  });

  // Fewer than three is a list too short for "the recent ones" to pick anything out,
  // so it does not try to.
  it("marks out all of them when there are fewer than three", async () => {
    readTimeline.mockResolvedValue(
      claimsOf(
        { cell: "older", published: "2026-01-01T00:00:00Z" },
        { cell: "newer", published: "2026-09-01T00:00:00Z" },
      ),
    );
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    expect(host!.querySelectorAll('[data-recent="true"]').length).toBe(2);
  });
});

describe("a card as the way into the sheet", () => {
  const ONE = [{ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }];

  async function renderOne(content?: string) {
    readTimeline.mockResolvedValue(claimsOf({ ...ONE[0], content }));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    await render();
    return cards()[0];
  }

  it("opens it when the card body is clicked", async () => {
    const card = await renderOne();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    // On the meta line, which is card and not control -- the event bubbles to the
    // card the way a click anywhere in its body does.
    await act(async () => {
      card.querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
    // The whole body, which is what the card was cutting.
    expect(sheet!.textContent).toContain("line 39");
  });

  // THE CARD MUST NOT SWALLOW WHAT IS INSIDE IT. Every control in a card would
  // otherwise also open the sheet, because the click reaches the card after it.
  it("does NOT open it when a control inside the card is clicked", async () => {
    await renderOne();
    await clickLabel(`${en.mangrove.reference} — soil-ph`);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // And the control did its own job.
    expect(referenced).toHaveLength(1);
  });

  it("does not open it when the revoke disclosure is used", async () => {
    readTimeline.mockResolvedValue({
      ...claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }),
      reading: "published",
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    revoke.mockResolvedValue({});

    await render();
    await clickText(en.mangrove.published);
    await act(async () => {
      host!
        .querySelector("summary")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // Otherwise the sheet is mouse-only, which for a whole card is worse than the
  // button it replaced: at least that one was in the tab order.
  it("opens on Enter and on Space, with an accessible name", async () => {
    const card = await renderOne();
    expect(card.getAttribute("role")).toBe("button");
    expect(card.tabIndex).toBe(0);
    expect(card.getAttribute("aria-label")).toBe(
      en.mangrove.openPost.replace("{cell}", "soil-ph"),
    );

    for (const key of ["Enter", " "]) {
      await act(async () => {
        card.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
      // Back to closed, so the next key is opening it rather than finding it open.
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      await act(async () => {
        document
          .querySelector('[role="dialog"]')!
          .dispatchEvent(new Event("animationend", { bubbles: true }));
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }
  });

  // A card that opens onto exactly what is already on it is an affordance that lies,
  // so a short memory is not a control at all.
  it("is not a control when there is nothing more to read", async () => {
    const card = await renderOne("Two lines.\nThat is all.");
    expect(card.getAttribute("role")).toBeNull();
    expect(card.getAttribute("tabindex")).toBeNull();

    await act(async () => {
      card.querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("the revoke box", () => {
  it("keeps the warning in the box with the button, and nowhere else", async () => {
    readTimeline.mockResolvedValue({
      ...claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }),
      reading: "published",
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    await clickText(en.mangrove.published);

    const button = [...host!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(en.mangrove.revoke),
    )!;
    // The box is the button's own: danger-bordered, and holding the sentence that
    // says what a revoke does not do.
    const box = button.closest("div")!;
    expect(box.className).toContain("border-blocked");
    expect(box.textContent).toContain(en.mangrove.revokeNote);
    // The note used to be a footnote under the whole list. It is not in two places.
    const notes = host!.textContent!.split(en.mangrove.revokeNote).length - 1;
    expect(notes).toBe(1);
  });
});

// WHO PRODUCED IT, WHO GOT IT, AND WHETHER IT IS YOURS TO PASS ON.
//
// All three were already on the data and none of them was legible: an author was a
// bare uuid (or a uuid and "(bot)"), an audience was the literal word "subscription",
// and nothing on a card said whether the member was looking at their own memory.
//
// ASSERTED ON THE CARD, NOT ON THE PAGE. "you" and "your agent" are words this screen
// uses about the member in several places it did not change -- the tab's hint says
// "Your agent publishes as your bot", a reading is headed "Shared with you" -- so a
// whole-page `toContain` proves nothing and a whole-page `not.toContain` fails against
// copy that was always there.

const MINE = {
  cell: "mine",
  author: ME.personId,
  object: { id: "mangrove:obj:mine", type: "MemoryNote", cell: "mine", content: "6.4" },
  published: "2026-09-22T13:00:00Z",
  deleted: false,
  evidence: 0,
  audience: [] as string[],
};

const BY_MY_AGENT = {
  ...MINE,
  cell: "agents",
  author: ME.serviceId,
  object: { ...MINE.object, id: "mangrove:obj:agents", cell: "agents" },
  published: "2026-09-22T12:00:00Z",
  audience: ["mangrove:group:subscription:s1"],
};

const THEIRS = {
  ...MINE,
  cell: "theirs",
  author: "mangrove:actor:alice:person",
  object: { ...MINE.object, id: "mangrove:obj:theirs", cell: "theirs" },
  published: "2026-09-22T11:00:00Z",
  audience: ["mangrove:actor:bob:person"],
};

const TO_THE_TENANT = {
  ...THEIRS,
  cell: "everybody",
  object: { ...MINE.object, id: "mangrove:obj:everybody", cell: "everybody" },
  published: "2026-09-22T10:00:00Z",
  audience: ["mangrove:group:tenant:t1"],
};

const FOUR = {
  reading: "received",
  claims: [MINE, BY_MY_AGENT, THEIRS, TO_THE_TENANT],
  held: [],
};

/** The card whose memory is about this cell. */
function cardOf(cell: string): HTMLLIElement {
  return cards().find((li) => li.querySelector("p")!.textContent!.startsWith(`${cell} ·`))!;
}

/** Its meta line -- where a card says where it came from and where it went. */
function metaOf(cell: string): string {
  return cardOf(cell).querySelector("p")!.textContent!;
}

const by = (who: string) => en.mangrove.by.replace("{who}", who);
const to = (who: string) => en.mangrove.sharedWith.replace("{who}", who);

describe("who produced a memory", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("reads as you when your own person wrote it", async () => {
    await render();
    // WHOLE-LINE equality, because "by you" is a prefix of "by your agent": a
    // `toContain` would pass on the wrong card.
    expect(metaOf("mine")).toBe(`mine · ${by(en.mangrove.actorYou)} · ${to(en.mangrove.audiencePrivate)}`);
  });

  it("reads as your agent when your agent wrote it", async () => {
    await render();
    expect(metaOf("agents")).toBe(
      `agents · ${by(en.mangrove.actorYourAgent)} · ${to(en.mangrove.audienceSubscription)}`,
    );
  });

  // Neither of the two the app can resolve -- and no invented name either. An
  // arbitrary actor cannot be looked up, so the kind is named and the id stays.
  it("reads as neither when somebody else wrote it, and keeps their id", async () => {
    await render();
    const meta = metaOf("theirs");
    expect(meta).toContain(by(`${en.mangrove.actorPerson} (alice)`));
    expect(meta).not.toContain(en.mangrove.actorYou);
    expect(meta).not.toContain(en.mangrove.actorYourAgent);
  });

  // The byline must never be wrong, and identity arrives a beat after the first
  // paint -- so the impersonal form is what a not-yet-known member's own post reads
  // as, rather than a guess that would have to be corrected.
  it("says a person rather than you while the member's own ids are unknown", async () => {
    readIdentity.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    await render();
    expect(metaOf("mine")).toBe(`mine · ${by(`${en.mangrove.actorPerson} (me)`)}`);
  });
});

describe("who a memory was shared with", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("names a person, a subscription and a tenant, rather than printing the id", async () => {
    await render();
    expect(metaOf("theirs")).toContain(to(`${en.mangrove.actorPerson} (bob)`));
    expect(metaOf("agents")).toContain(to(en.mangrove.audienceSubscription));
    expect(metaOf("everybody")).toContain(to(en.mangrove.audienceTenant));
    // The literal words the two group ids used to render as.
    expect(metaOf("agents")).not.toContain("mangrove:group:");
  });

  // An empty audience means published to the author alone. That is an answer on your
  // own post, and an invention on anybody else's -- the timeline is simply not saying
  // who else received theirs.
  it("says only you on your own post with no audience, and nothing on somebody else's", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [MINE, { ...THEIRS, audience: [] }],
      held: [],
    });
    await render();
    expect(metaOf("mine")).toContain(to(en.mangrove.audiencePrivate));
    expect(metaOf("theirs")).not.toContain(en.mangrove.audiencePrivate);
    expect(metaOf("theirs")).toBe(`theirs · ${by(`${en.mangrove.actorPerson} (alice)`)}`);
  });
});

/** The "share with others" control inside this card, if it has one. */
function shareControl(cell: string): HTMLButtonElement | undefined {
  return [...cardOf(cell).querySelectorAll("button")].find((b) =>
    b.textContent?.includes(en.mangrove.shareOthers),
  );
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("passing a memory on", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: true });
  });

  // A UI decision, not the rule the service enforces: the mangrove lets a recipient
  // re-share within their own reach. Restricting the affordance to the author is what
  // keeps the byline beside it worth trusting.
  it("is offered on a post either of your own actors wrote, and not on somebody else's", async () => {
    await render();
    expect(shareControl("mine")).toBeDefined();
    expect(shareControl("agents")).toBeDefined();
    expect(shareControl("theirs")).toBeUndefined();
    expect(shareControl("everybody")).toBeUndefined();
  });

  it("is not offered at all while the member's own ids are unknown", async () => {
    readIdentity.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    await render();
    expect(shareControl("mine")).toBeUndefined();
  });

  it("sends the object and the audience the member chose", async () => {
    shareWith.mockResolvedValue({});
    await render();
    await click(shareControl("mine")!);

    const panel = cardOf("mine").querySelector("[data-inner]")!;
    const subscription = [...panel.querySelectorAll('[role="radio"]')].find(
      (r) => r.textContent?.trim() === en.mangrove.groupSubscription,
    )!;
    await click(subscription);
    const send = [...panel.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === en.mangrove.publishAction,
    )!;
    await click(send);

    expect(shareWith).toHaveBeenCalledWith(workspace, "mangrove:obj:mine", {
      to: ["mangrove:group:subscription:s1"],
      toEmails: [],
    });
    expect(cardOf("mine").textContent).toContain(en.mangrove.publishedOk);
    // AND THE READING IS RE-READ. The card's own meta line says who this memory
    // reached, so leaving it as it was would print "shared with only you" directly
    // above the word "Shared."
    expect(readTimeline).toHaveBeenCalledTimes(2);
  });

  // "Only you" is not an answer to "who else should get this": the memory is already
  // the author's own.
  it("does not offer only-you, and offers no group to somebody who governs none", async () => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    await render();
    await click(shareControl("mine")!);

    const labels = [...cardOf("mine").querySelectorAll('[role="radio"]')].map((r) =>
      r.textContent?.trim(),
    );
    expect(labels).toEqual([en.mangrove.scopePeople]);
  });

  // THE PANEL IS AN INNER CONTROL. The card opens a sheet when it is clicked, and a
  // form inside it has padding and prose that are not <button>s -- which is what
  // `[data-inner]` is for.
  it("does not open the sheet, neither the control nor anything in its panel", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [{ ...MINE, object: { ...MINE.object, content: LONG_BODY } }],
      held: [],
    });
    await render();
    // The card really is one that HAS a sheet, or this asserts nothing.
    expect(cards()[0].getAttribute("role")).toBe("button");

    await click(shareControl("mine")!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    // The panel's own explanatory line: not a control, and still not the card.
    const hint = [...cardOf("mine").querySelectorAll("p")].find(
      (el) => el.textContent === en.mangrove.shareOthersHint,
    )!;
    await click(hint);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
