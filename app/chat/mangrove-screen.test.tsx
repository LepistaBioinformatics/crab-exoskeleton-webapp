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
const markRead = vi.fn();
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
    markRead: (...a: unknown[]) => markRead(...a),
    decide: (...a: unknown[]) => decide(...a),
    revoke: (...a: unknown[]) => revoke(...a),
    publish: (...a: unknown[]) => publish(...a),
    findPeople: (...a: unknown[]) => findPeople(...a),
    mergeFragment: (...a: unknown[]) => mergeFragment(...a),
    downloadBlob: (...a: unknown[]) => downloadBlob(...a),
    readIdentity: (...a: unknown[]) => readIdentity(...a),
    shareWith: (...a: unknown[]) => shareWith(...a),
    resolveActors: (...a: unknown[]) => resolveActors(...a),
  };
});

const resolveActors = vi.fn();

const uploadMedia = vi.fn();
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, uploadMedia: (...a: unknown[]) => uploadMedia(...a) };
});

import MangroveScreen from "./mangrove-screen";
import { requestMangroveShare, takePendingShare } from "./mangrove-share-bus";
import { GRAPH_FRAGMENT_MEDIA_TYPE, MangroveError } from "@/lib/mangrove";
import { buildReferenceMarker, type ChatReference } from "@/lib/chatReference";
import { chatCopy } from "@/lib/i18n/chat";
import { errorCopy } from "@/lib/i18n/errors";
import type { Workspace } from "./fragment";

const en = chatCopy.en;
const errs = errorCopy.en;

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

async function render(inside?: { workspace: Workspace; projectName: string | null }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MangroveScreen
        workspace={inside?.workspace ?? workspace}
        projectName={inside?.projectName}
        subscriptionName="Soil Lab"
        onReference={(ref) => referenced.push(ref)}
      />,
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
  // The save control fetches the blob itself, with the real `blobFile`.
  vi.unstubAllGlobals();
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

  // ONE LIST, AND AN UNREAD MARK ON IT. There was a second section here --
  // "Waiting for you", with an Admit button under each card -- and both are
  // gone. Admit was described as what kept a shared memory out of your agent
  // until you took it; it never was, because the held item was delivered with
  // its object and the agent had an admit of its own. What members were really
  // doing with it was marking mail read, so that is what it is.
  it("shows a directly shared item in the feed, marked unread", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: false,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    const html = await render();
    expect(html).toContain("6.4");
    const unreadCard = host!.querySelector<HTMLLIElement>("[data-unread]");
    expect(unreadCard, "the unread mark is missing").not.toBeNull();
    // THE MARK IS THE LEFT EDGE, and the attribute alone does not draw it. A dot
    // needs a corner and competes with the byline for the one the eye already
    // uses; an edge is read down a whole column at once, which is the question an
    // inbox is being asked -- which of these have I not been through.
    expect([...unreadCard!.classList], "nothing draws the unread edge").toContain(
      "border-l-accent",
    );
    // RESERVED, NOT ADDED. Four pixels on the left whether or not they are
    // coloured, or every card in the list shifts three pixels sideways the moment
    // one is opened.
    expect([...unreadCard!.classList]).toContain("border-l-4");
    // NO SECOND LIST AND NO BUTTON THAT GATES THE FIRST. Asserted against the
    // headings that ARE offered rather than against the two strings that used to
    // be, because those are gone from the catalogue -- a negative assertion on a
    // string nothing can produce passes forever and says nothing.
    expect(html.match(/<h2/g) ?? [], "a second section came back").toHaveLength(1);
    expect(html).toContain(en.mangrove.receivedTitle);
    // Somebody's AGENT, not a peer -- said in words, with the id it is the only
    // handle for kept beside them.
    expect(html).toContain(`${en.mangrove.actorAgent} (bob)`);
  });

  // OPENING THE CARD IS WHAT SENDS THE RECEIPT, and it names the OBJECT. Every
  // card opens now -- a short note, a file and a fragment used to answer a click
  // with nothing, because only long prose had a sheet behind it.
  it("sends a receipt for the object when the card is opened", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: false,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    markRead.mockResolvedValue({});

    await render();
    const card = host!.querySelector<HTMLLIElement>("[data-unread]");
    expect(card, "no unread card to open").not.toBeNull();

    await act(async () => {
      card!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(markRead).toHaveBeenCalledTimes(1);
    expect(markRead.mock.calls[0][1], "the receipt must name the object").toBe(
      "mangrove:obj:1",
    );
    // AND THE MARK GOES AT ONCE. The receipt is a round trip; leaving the dot
    // there until it lands makes the click look like it missed.
    expect(host!.querySelector("[data-unread]")).toBeNull();
  });

  // A RECEIPT THAT DOES NOT LAND MUST NOT PUT THE MARK BACK. It would tell the
  // member they had not read something they had just read, and the next reload
  // asks the server again anyway.
  it("keeps it read when the receipt fails", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: false,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    markRead.mockRejectedValue(new Error("down"));

    await render();
    await act(async () => {
      host!
        .querySelector<HTMLLIElement>("[data-unread]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host!.querySelector("[data-unread]")).toBeNull();
  });

  // WHAT A CLOSED CARD SHOWS, AND WHAT IT DOES NOT.
  //
  // Who sent it, what it is about and enough of it to recognise stay on screen;
  // the record and everything that DOES something are behind the open. The
  // actions were in the open on every card at once, which put "merge into my
  // memory" -- the one act here that writes a member's own graph -- at the same
  // weight as the byline.
  //
  // `hidden`, not unrendered: the subtree keeps its state, and the attribute is
  // what takes it out of the tab order and the accessibility tree together.
  it("keeps the record and the actions behind the open", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: true,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    const card = cardOf("soil-ph");
    const footer = card.querySelector("footer")!;
    expect(footer.hidden, "the footer is open on a closed card").toBe(true);
    // The three that stay: who, what it is about, and the body.
    expect(card.textContent).toContain("bob");
    expect(card.textContent).toContain("soil-ph");
    expect(card.textContent).toContain("6.4");

    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card.querySelector("footer")!.hidden, "opening did not reveal the footer").toBe(
      false,
    );
    expect(card.getAttribute("aria-expanded")).toBe("true");

    // AND IT CLOSES AGAIN. A card that could only ever be opened would leave a
    // read feed permanently at full height.
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card.querySelector("footer")!.hidden).toBe(true);
  });

  // CLOSING IT AGAIN SENDS NOTHING. Having read something does not stop being
  // true, and a receipt on every toggle would be noise in the log.
  //
  // THE SCREEN IS WHAT ENFORCES THIS, not the card: `onRead` is guarded on the
  // claim still being unread. The card guards its own edge as well, for any other
  // caller, but that one is belt and braces and this does not reach it -- taking
  // it out leaves this test green, which is worth knowing before trusting it as a
  // test of the card.
  it("sends one receipt however many times the card is toggled", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: false,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    markRead.mockResolvedValue({});

    await render();
    const card = cardOf("soil-ph");
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  // ALREADY OPENED MEANS NO MARK. The server answers `read` per reader, so a
  // card the member has been through is an ordinary card.
  it("draws no mark on something already opened", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.4" },
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: true,
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    await render();
    expect(host!.querySelector("[data-unread]")).toBeNull();
    // The gutter is still four pixels wide -- it is just not coloured.
    const card = cards()[0];
    expect([...card.classList]).toContain("border-l-4");
    expect([...card.classList], "a read card is still wearing the mark").not.toContain(
      "border-l-accent",
    );
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
    // 2 entities, 3 observations between them, 1 relation -- each as its own row, the
    // numeral set apart from what it counts.
    expect(text).toContain(`2 ${en.mangrove.fragmentEntities}`);
    expect(text).toContain(`3 ${en.mangrove.fragmentObservations}`);
    expect(text).toContain(`1 ${en.mangrove.fragmentRelations}`);

    // AND THE SHAPE OF IT. A node per entity and a line per relation between two of
    // them, which is what the counts cannot say: whether this is one cluster or a
    // handful of unconnected names.
    const map = cards()[0].querySelector('svg[role="img"]')!;
    expect(map.getAttribute("aria-label")).toBe(
      en.mangrove.fragmentMap.replace("{count}", "2"),
    );
    expect(map.querySelectorAll("circle")).toHaveLength(2);
    expect(map.querySelectorAll("line")).toHaveLength(1);
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

// SAVING A PUBLISHED FILE INTO THE WORKSPACE, AND SAYING WHICH ONE.
//
// The act is two calls this app already had -- the blob route for the bytes, /api/media
// for the write -- so what these pin is not the plumbing but the promise: the workspace
// named on the card and the workspace the upload addresses are the SAME value. They came
// apart once already one layer down (see the `project` line in `uploadMedia`), and a
// member inside a project who is told "your files" and finds the file in the agent's own
// workspace has been handed exactly that bug with a label on it.
//
// The blob fetch is the real `blobFile` against a stubbed `fetch`: mocking it away would
// leave the digest -- the only handle the bytes have -- unasserted.

/** What the blob route answers, or refuses with. */
function servingBlob(answer: { ok: true } | { ok: false; body: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    return answer.ok
      ? { ok: true, blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }) }
      : { ok: false, status: 403, json: async () => answer.body };
  });
  return calls;
}

describe("saving a published file into the workspace", () => {
  const FILE = {
    id: "mangrove:obj:file",
    type: "MemoryNote",
    cell: "q2-report",
    blob: "a".repeat(64),
    fileName: "q2.pdf",
    size: 2048,
  };

  const PROSE = {
    id: "mangrove:obj:prose",
    type: "MemoryNote",
    cell: "soil-ph",
    content: "pH 5.2 after liming.",
    mediaType: "text/markdown",
  };

  const inProject = {
    workspace: { ...workspace, p: "proj-1" } as Workspace,
    projectName: "Field trials",
  };

  const save = () => clickLabel(`${en.mangrove.saveToFiles} — q2.pdf`);

  beforeEach(() => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    uploadMedia.mockResolvedValue({ path: "uploads/q2.pdf", name: "q2.pdf", size: 8 });
  });

  it("is offered on a file, and on nothing that is not one", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    await render();
    expect(host!.textContent).toContain(en.mangrove.saveToFiles);

    act(() => root!.unmount());
    host!.remove();

    readTimeline.mockResolvedValue(claimOf(PROSE));
    await render();
    // Prose has nowhere to land: there is no file to write.
    expect(host!.textContent).not.toContain(en.mangrove.saveToFiles);
  });

  it("names the project, and uploads into that same project", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    const fetched = servingBlob({ ok: true });

    await render(inProject);
    // Said BEFORE the press, and with the project named rather than its id.
    expect(host!.textContent).toContain(
      en.mangrove.saveToProject.replace("{project}", "Field trials"),
    );
    expect(host!.textContent).not.toContain("proj-1");

    await save();

    // The bytes came from the digest...
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain(`blob=${FILE.blob}`);
    // ...and the write went where the card said it would. `uploadMedia` reads `p` off
    // this very object, so the label and the destination cannot disagree.
    const [sent, file] = uploadMedia.mock.calls[0] as [Workspace, File];
    expect(sent.p).toBe("proj-1");
    expect(file.name).toBe("q2.pdf");
  });

  it("names the agent's own files, and sends no project, when none is open", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    servingBlob({ ok: true });

    await render();
    expect(host!.textContent).toContain(en.mangrove.saveToAgent);
    expect(host!.textContent).not.toContain(en.mangrove.saveToProjectUnnamed);

    await save();

    const [sent] = uploadMedia.mock.calls[0] as [Workspace];
    expect(sent.p).toBeFalsy();
  });

  it("says a project is open even before its name has arrived", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    // The project list is still in flight: the id is known, the name is not, and a
    // uuid is not something to put in front of anybody.
    await render({ workspace: inProject.workspace, projectName: null });
    expect(host!.textContent).toContain(en.mangrove.saveToProjectUnnamed);
    expect(host!.textContent).not.toContain(en.mangrove.saveToAgent);
  });

  it("warns that a file of the same name is replaced, before anything is pressed", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    await render();
    // `StoreMedia` opens the sanitized name with O_TRUNC. There is no outcome in which
    // it asks, so the screen says.
    expect(host!.textContent).toContain(en.mangrove.saveOverwrites);
  });

  it("reports where it landed, by the path the upload answered", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    servingBlob({ ok: true });

    await render();
    await save();

    // The stored path, folder and all -- a silent success on a file operation is
    // indistinguishable from nothing having happened.
    expect(host!.textContent).toContain(en.mangrove.saved.replace("{path}", "uploads/q2.pdf"));
  });

  it("keeps the mangrove's own sentence when it refuses the bytes", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    const refusal = "that blob belongs to another subscription";
    servingBlob({ ok: false, body: { error: refusal } });

    await render();
    await save();

    // Shown as it arrived: it names the reason, and this client cannot.
    expect(host!.textContent).toContain(refusal);
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(host!.textContent).not.toContain(en.mangrove.saved.replace("{path}", "uploads/q2.pdf"));
  });

  it("translates the media route's code, which is never prose", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    servingBlob({ ok: true });
    // /api/media forwards a STATUS-derived code on purpose (MEDIA_ERROR_CODES), so the
    // dictionary is the only place it becomes a sentence.
    uploadMedia.mockRejectedValue(new Error("too_large"));

    await render();
    await save();

    expect(host!.textContent).toContain(errs.too_large);
    expect(host!.textContent).not.toContain("too_large");
  });

  it("does not put the browser's own words on screen when the connection drops", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    // Neither leg catches a fetch that reached nothing, so this is what a dropped
    // connection actually throws. The message is the BROWSER's, and it differs per
    // engine -- it is not a sentence anybody wrote about this file.
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });

    await render();
    await save();

    expect(host!.textContent).toContain(en.mangrove.saveFailed);
    expect(host!.textContent).not.toContain("Failed to fetch");
  });

  it("does not open the sheet when the control is pressed", async () => {
    readTimeline.mockResolvedValue(claimOf(FILE));
    servingBlob({ ok: true });

    await render();
    await save();

    // `fromControl` refuses events from a <button>; a file card is also never
    // `openable` in the first place. Both have to hold.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("is not offered on something still waiting on a decision", async () => {
    // Whoever governs the scope has to READ it to decide. Putting it into their
    // workspace before they have accepted it is the same thing merging is refused for.
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [],
      held: [],
      pending: [
        {
          activityId: "act-1",
          author: "mangrove:actor:bob:service",
          scope: "mangrove:group:subs",
          object: FILE,
          published: "2026-09-22T10:00:00Z",
        },
      ],
    });
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: false });

    await render();
    expect(host!.textContent).toContain(en.mangrove.pendingTitle);
    // The bytes are still readable -- a download leaves the system.
    expect(host!.textContent).toContain(en.mangrove.downloadFile);
    expect(host!.textContent).not.toContain(en.mangrove.saveToFiles);
    expect(host!.textContent).not.toContain(en.mangrove.saveOverwrites);
  });
});

describe("where a merge lands", () => {
  const FRAGMENT = {
    id: "mangrove:obj:frag",
    type: "MemoryNote",
    cell: "mangroves",
    mediaType: GRAPH_FRAGMENT_MEDIA_TYPE,
    content: FRAGMENT_BODY,
  };

  beforeEach(() => {
    readTimeline.mockResolvedValue(claimOf(FRAGMENT));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  // This already went to the project's graph -- `mergeFragment` sends it. What was
  // missing is the same thing the file save would have shipped without: the screen
  // never said so.
  it("names the project the fragment will be merged into", async () => {
    await render({ workspace: { ...workspace, p: "proj-1" } as Workspace, projectName: "Field trials" });
    expect(host!.textContent).toContain(
      en.mangrove.mergeToProject.replace("{project}", "Field trials"),
    );
  });

  it("names the agent's own memory when no project is open", async () => {
    await render();
    expect(host!.textContent).toContain(en.mangrove.mergeToAgent);
  });

  it("does not open the sheet when the merge is pressed", async () => {
    mergeFragment.mockResolvedValue({
      entitiesCreated: 1,
      observationsAdded: 0,
      relationsCreated: 0,
    });
    await render();
    await clickText(en.mangrove.merge);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
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

/**
 * The cards on screen, in the order they are rendered.
 *
 * Filtered on the footer every card has, because a fragment's entity chips are <li>
 * too -- an unfiltered list would count them as cards in any fixture holding one.
 */
function cards(): HTMLLIElement[] {
  return [...host!.querySelectorAll("li")].filter((li) => li.querySelector(":scope > footer"));
}

/** The nearest ancestor that caps the width, as the class that does it. */
function frameOf(el: Element): string {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const cap = [...at.classList].find((c) => c.startsWith("max-w-"));
    if (cap) return cap;
  }
  throw new Error("no max-width ancestor");
}

/** The card's regions, in the order they are rendered. */
function regionsOf(li: HTMLLIElement): string[] {
  return [...li.children].map((el) => el.tagName);
}

/**
 * The byline band's SENTENCE: who the memory is from.
 *
 * The paragraph and not the band, because the band also carries the action pill
 * now -- a fact about the thing rather than about the person, which is why it is
 * set apart from the sentence rather than appended to it. Reading the band whole
 * would make every byline assertion here fail the day a second element joined it,
 * which is exactly what happened.
 */
function bylineOf(li: HTMLLIElement): string {
  return li.children[0].querySelector("p")!.textContent!;
}

/**
 * The open tooltip, wherever in the document it is.
 *
 * It is portalled to the body rather than living in the face it belongs to,
 * because the card clips its own overflow and the recipients column sits at the
 * card's edge -- so looking for it inside the card is looking in the one place it
 * must not be.
 */
function tooltip(): HTMLElement | null {
  return document.querySelector('[role="tooltip"]');
}

/**
 * What the card says HAPPENED: the pill at the end of the byline band.
 *
 * The band's LAST element child. Not `span:last-of-type` -- the name inside the
 * byline sentence is a span too, and being the only span in its own parent it
 * matches that selector first.
 */
function actionOf(li: HTMLLIElement): string {
  return li.children[0].lastElementChild!.textContent!;
}

/** The glyph the byline draws, as class tokens -- `lucide-bot` or `lucide-user`. */
function bylineGlyph(li: HTMLLIElement): string[] {
  return li.children[0].querySelector("svg")!.getAttribute("class")!.split(" ");
}

/** What the card says it IS, above the body. */
function headerOf(li: HTMLLIElement): string {
  return li.querySelector("header")!.textContent!;
}

/** The body: the region between the title and the record. */
function bodyOf(li: HTMLLIElement): Element {
  return li.children[2];
}

/** The recipient faces, as [glyph, accessible name] pairs, in order. */
function facesOf(li: HTMLLIElement): [string, string][] {
  const dd = [...li.querySelectorAll("footer dt")]
    .find((d) => d.textContent === en.mangrove.recipientsLabel)
    ?.parentElement?.querySelector("dd");
  return [...(dd?.querySelectorAll("button[aria-label]") ?? [])].map((b) => [
    [...b.querySelector("svg")!.classList].find((c) => c.startsWith("lucide-") && c !== "lucide")!,
    b.getAttribute("aria-label")!,
  ]);
}

/** The answer the card's record gives under one of its column headings. */
function field(li: HTMLLIElement, label: string): string | undefined {
  const dt = [...li.querySelectorAll("footer dt")].find((d) => d.textContent === label);
  return dt?.parentElement?.querySelector("dd")?.textContent ?? undefined;
}

/** Every column heading the record carries, in order -- so an EXTRA one fails too. */
function labelsOf(li: HTMLLIElement): string[] {
  return [...li.querySelectorAll("footer dt")].map((d) => d.textContent!);
}

describe("the reading, as a list of cards", () => {
  const SHUFFLED = [
    { cell: "third", published: "2026-03-02T09:00:00Z" },
    { cell: "fifth", published: "2026-01-01T00:00:00Z" },
    { cell: "first", published: "2026-09-22T10:00:00Z" },
    { cell: "fourth", published: "2026-03-01T09:00:00Z" },
    { cell: "second", published: "2026-06-15T23:59:59Z" },
  ];

  // ONE CARD TO A ROW, which is what a feed is. A behavioural test cannot see a column
  // count -- the cards render either way -- so this asserts the classes that produce
  // it, the way `pane-weight.test.ts` asserts a hairline. It exists because this WAS
  // briefly a two-column grid: the reversal is a decision, and a decision nobody can
  // fail to notice reversing again.
  it("stacks the cards in one column", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    await render();

    const list = cards()[0].parentElement!;
    expect(list.tagName).toBe("UL");
    const classes = list.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    expect(classes.filter((c) => c.includes("grid"))).toEqual([]);

    // AND NOT ACROSS THE WHOLE PANE. One column only reads as a feed if the column is
    // narrow; at the frame's full width it is a stack of bands. Asserted as the exact
    // cap rather than "some max-width", or widening it would pass.
    expect(frameOf(list)).toBe("max-w-lg");
  });

  it("renders them most recent first, whatever order they arrived in", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    // Prose is headed by its cell, so the cards' own headers are the order.
    const order = cards().map(headerOf);
    expect(order).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  // THE ORDER IS THE WHOLE SIGNAL. The top three used to carry an accent edge and a
  // lift as well, which said a second time what being at the top of a newest-first
  // list already says -- and said it in the accent, which everywhere else in this
  // card means "you can act on this". Every card is drawn the same now, and this
  // asserts the absence so it cannot come back as a well-meant highlight.
  it("draws every card alike, leaving recency to the order", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    const all = cards();
    expect(all.length).toBe(5);
    expect(host!.querySelectorAll("[data-recent]")).toHaveLength(0);
    const edges = new Set(
      all.map((c) =>
        [...c.classList].filter((x) => x.startsWith("border") || x.startsWith("shadow")).join(" "),
      ),
    );
    // ALL FIVE THE SAME, which is the claim -- not "no accent anywhere". The left
    // edge is the unread mark now and every one of these is unread, so the accent
    // is on all of them or on none. What must never come back is the top three
    // carrying something the other two do not, and one distinct value is what
    // says so.
    expect([...edges], "some cards carry an edge the others do not").toHaveLength(1);
  });
});

// HOW HEAVY A CARD IS WHEN NOBODY IS ON IT.
//
// Every card carried a `rule-strong` edge and two `elevated` bands -- byline across
// the top, record across the bottom -- against its own `surface`. One card at a time
// that is structure; a column of them is three tones and an outline repeating down
// the pane, which is what "grosseiro" named. The structure is not gone, it is on the
// POINTER now: at rest the only step left is the one a reader actually needs, the
// card's `surface` against the pane's `bg`, with the gap doing the separating.
//
// Asserted on the classes, because jsdom computes no styles and cannot hover -- the
// same reason `pane-ground.test.ts` reads source. What is pinned is the PAIR: that
// the resting tone is gone AND that a hover variant took its place, because dropping
// the first alone is a card with no structure at all.
describe("how heavy a card is at rest", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("carries a transparent edge that only colours under the pointer", async () => {
    await render();
    const card = cards()[0];
    const cls = [...card.classList];
    expect(cls, "the edge is reserved so colouring it cannot move anything").toContain(
      "border-transparent",
    );
    expect(cls, "a resting edge is the outline being removed").not.toContain(
      "border-rule-strong",
    );
    expect(
      cls.some((c) => c.startsWith("hover:border-") || c.startsWith("focus-within:border-")),
      "nothing ever draws this card's edge",
    ).toBe(true);
  });

  it("is the hover group its own regions read", async () => {
    await render();
    // NAMED, not bare. `group-hover:` binds to whichever ancestor carries `group`,
    // so a bare one here would hand the card's treatment to any pane or row that
    // grew one later -- and every card in the list would light up together.
    expect([...cards()[0].classList]).toContain("group/card");
  });

  it("leaves its bands untinted until then", async () => {
    await render();
    const card = cards()[0];
    const bands = [card.querySelector("[data-inner]")!, card.querySelector("footer dl")!];
    for (const band of bands) {
      const cls = [...band.classList];
      expect(cls, "a band tinted at rest is one of the two steps being removed").not.toContain(
        "bg-elevated",
      );
      expect(cls, "and it has to come back on hover, or the region has no edge at all").toContain(
        "group-hover/card:bg-elevated",
      );
    }
  });

  // The pointer is not the only way in. A member on the keyboard reaching a card's
  // controls gets the same regions the pointer does, or the card is structureless for
  // exactly the people with the least other signal about where they are. `:focus-visible`
  // rather than `:focus-within`, so a MOUSE click on a card's button does not leave the
  // card lit up behind the pointer that has already moved on.
  it("does the same for the keyboard", async () => {
    await render();
    const card = cards()[0];
    for (const band of [card.querySelector("[data-inner]")!, card.querySelector("footer dl")!]) {
      expect([...band.classList]).toContain("group-has-[:focus-visible]/card:bg-elevated");
    }
  });

  // THE ONE CONTRAST LEFT, and the reason the rest could go. Were the card to sit on
  // the pane's own fill it would have no edge at rest whatsoever.
  it("keeps the step between the card and the pane under it", async () => {
    await render();
    // The other half of the step -- that the pane under it is NOT also `surface` --
    // is `pane-ground.test.ts`'s, which owns what each region of the shell sits on.
    expect([...cards()[0].classList]).toContain("bg-surface");
  });
});

// KEEPING IT CURRENT, WHICH IS THIS SECTION'S PROBLEM AND NOT THE OTHER FIVE'S.
//
// Files, memory, the graph and tasks change because this member or their own agent
// changed them -- the pane is looking at them as it happens. A claim arrives because
// SOMEBODY ELSE'S agent published it, while the member is reading the conversation
// beside the pane, and until now nothing said so short of closing the pane and
// opening it again.
//
// Two answers, and the pane header's control is only one of them. There is no SWR or
// query cache in this app: `useMangrove` is a `useState`/`useEffect` pair, so the
// refetch is a `setInterval` and everything a cache would have given for free -- not
// revalidating a hidden tab, not clobbering good data with a failed background read --
// is written out and asserted here.
describe("keeping the mangrove current", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads itself again a minute after it mounted", async () => {
    await render();
    expect(readTimeline).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(readTimeline).toHaveBeenCalledTimes(2);
  });

  // A MINUTE, not a second. Asserted as "not yet" at 59s as well as "yes" at 60s,
  // because an interval that fired far too often would pass the test above.
  it("does not read more often than that", async () => {
    await render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(readTimeline).toHaveBeenCalledTimes(1);
  });

  // THE ONE A CACHE WOULD HAVE GIVEN FOR FREE. A read the member never asked for must
  // not be able to replace the feed they are reading with an error -- so a failed poll
  // keeps the last good answer and waits for the next one.
  it("keeps what is on screen when a poll fails", async () => {
    await render();
    expect(cards()).toHaveLength(1);

    readTimeline.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(readTimeline).toHaveBeenCalledTimes(2);
    expect(cards(), "a background read replaced the feed with an error").toHaveLength(1);
  });

  // A pane left open in a background tab would otherwise read itself all day for
  // nobody.
  it("does not read while the tab is hidden", async () => {
    await render();
    const before = readTimeline.mock.calls.length;
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
      });
      expect(readTimeline).toHaveBeenCalledTimes(before);
    } finally {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
    }
  });

  // `mangrove_off` is not a transient failure -- it is an operator who never configured
  // one, and it cannot change without the proxy restarting. Polling it is a request a
  // minute, forever, for an answer nobody is waiting on.
  it("does not poll a deployment that has no mangrove", async () => {
    readTimeline.mockRejectedValue(new MangroveError("mangrove_off"));
    readCapabilities.mockRejectedValue(new MangroveError("mangrove_off"));

    await render();
    const before = readTimeline.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(readTimeline).toHaveBeenCalledTimes(before);
  });

  // THE PANE HEADER'S CONTROL, from this side. A counter rather than a callback, the
  // same shape the graph and tasks panels take -- `workspace-screen.test.tsx` asserts
  // the button exists and is labelled for the mangrove; this asserts it lands.
  it("re-reads when the refresh signal is bumped", async () => {
    await render();
    expect(readTimeline).toHaveBeenCalledTimes(1);

    await act(async () => {
      root!.render(
        <MangroveScreen workspace={workspace} subscriptionName="Soil Lab" refreshSignal={1} />,
      );
    });
    expect(readTimeline).toHaveBeenCalledTimes(2);
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

  // A CLICK ON THE CARD OPENS THE CARD. It used to open the sheet, which only
  // long prose had -- so a file, a fragment and a short note each answered a
  // click with nothing while their actions sat in the open regardless. The sheet
  // is one of the controls the open reveals now.
  it("expands the card when the body is clicked, and does not jump to the sheet", async () => {
    const card = await renderOne();
    expect(card.getAttribute("aria-expanded")).toBe("false");

    // On a paragraph of the body, which is card and not control -- the event bubbles
    // to the card the way a click anywhere in its body does.
    await act(async () => {
      bodyOf(card)
        .querySelector("p")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.querySelector('[role="dialog"]'),
      "opening a card threw the member straight into a sheet",
    ).toBeNull();
  });

  it("offers the sheet from inside the opened card, with the whole body in it", async () => {
    const card = await renderOne();
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await clickText(en.mangrove.readInFull);
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

  // Otherwise the card is mouse-only, which for the thing that both reveals every
  // control and sends the receipt is worse than the button it replaced: at least
  // that one was in the tab order.
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
      expect(card.getAttribute("aria-expanded"), `${key} did not open it`).toBe("true");
      // Back to closed, so the next key is opening it rather than finding it open.
      await act(async () => {
        card.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
      expect(card.getAttribute("aria-expanded")).toBe("false");
    }
  });

  // A SHORT MEMORY IS STILL A CONTROL, and this is the assertion that reversed.
  // It used to say the opposite: a card whose body was whole on screen had no
  // sheet, so making it clickable was an affordance that lied. Opening does
  // something for every card now -- it reveals the record and the controls, and
  // it is how the thing gets marked read -- so the one kind of card that used to
  // be inert is the one this checks.
  it("is a control even when the body is whole on the card", async () => {
    const card = await renderOne("Two lines.\nThat is all.");
    expect(card.getAttribute("role")).toBe("button");
    expect(card.tabIndex).toBe(0);

    await act(async () => {
      bodyOf(card)
        .querySelector("p")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card.getAttribute("aria-expanded")).toBe("true");
    // And no sheet is offered, because there is nothing it would show that the
    // card is not already showing.
    expect(card.textContent).not.toContain(en.mangrove.readInFull);
  });
});

// THE CARD'S BOTTOM SECTION, WHICH IS WHERE THE PROVENANCE WENT.
//
// It used to be a line of run-together small print ABOVE the body -- cell, byline,
// audience and endorsements joined by middle dots -- so the first thing read on every
// card was four items that had to be parsed to find two answers, and the memory itself
// started halfway down. It is a record in columns under the body now.
//
// What these pin is the arrangement, because the arrangement is the whole change: the
// order of the three regions, that every one of those facts survived the move, that
// none of them is left above the body -- and that the footer is INERT, which is the bug
// this refactor was most likely to reintroduce. Half a card's content moving into a new
// region is exactly how a region ends up opening the sheet the card opens.

const SHARED_FILE = {
  reading: "received",
  claims: [
    {
      cell: "attachments/nota-manguezais.md",
      author: "mangrove:actor:alice:person",
      object: {
        id: "mangrove:obj:nota",
        type: "MemoryNote",
        cell: "attachments/nota-manguezais.md",
        blob: "b".repeat(64),
        fileName: "nota-manguezais.md",
        size: 2048,
      },
      published: "2026-09-22T10:00:00Z",
      deleted: false,
      evidence: 2,
      audience: ["mangrove:group:tenant:t1"],
    },
  ],
  held: [],
};

describe("the record under a card", () => {
  beforeEach(() => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("lays every card out as a byline, a header, a body and a record, in that order", async () => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    await render();
    expect(regionsOf(cards()[0])).toEqual(["DIV", "HEADER", "DIV", "FOOTER"]);

    readTimeline.mockResolvedValue(SHARED_FILE);
    await render();
    expect(regionsOf(cards()[0])).toEqual(["DIV", "HEADER", "DIV", "FOOTER"]);

    // The third kind, whose header is its own branch: a fragment is titled by WHAT it
    // is, since a piece of a graph has no name of its own.
    readTimeline.mockResolvedValue(
      claimOf({
        id: "mangrove:obj:frag",
        type: "MemoryNote",
        cell: "graph:b8d28853aae5",
        mediaType: GRAPH_FRAGMENT_MEDIA_TYPE,
        content: FRAGMENT_BODY,
      }),
    );
    await render();
    expect(regionsOf(cards()[0])).toEqual(["DIV", "HEADER", "DIV", "FOOTER"]);
    expect(headerOf(cards()[0])).toBe(en.mangrove.fragmentTitle);
    expect(field(cards()[0], ID)).toBe("graph:b8d28853aae5");
  });

  // ASSERTED ON A FILE, because it is the kind whose header and whose identifier are
  // different strings -- `nota-manguezais.md` against `attachments/nota-manguezais.md`.
  // On prose the two are one thing, and "the identifier is not above the body" would be
  // a claim about a coincidence.
  it("carries the sender in its byline, and the recipients and the identifier in its record", async () => {
    readTimeline.mockResolvedValue(SHARED_FILE);
    await render();
    const card = cards()[0];

    // THE SENDER IS THE BYLINE AND NOT A COLUMN. It is the only fact on the card about
    // a PERSON rather than about a thing, and the exact set of column headings below
    // is what stops it being in both places at once.
    expect(bylineOf(card)).toBe(`${SENDER} ${en.mangrove.actorPerson} (alice)`);
    expect(labelsOf(card)).toEqual([RECIPIENTS, ID, ENDORSED]);
    expect(facesOf(card)).toEqual([["lucide-building2", en.mangrove.audienceTenant]]);
    expect(field(card, ID)).toBe("attachments/nota-manguezais.md");
    expect(field(card, ENDORSED)).toBe("2");

    // The header says what the file IS, and nothing about where it came from -- the
    // byline is a region of its own and neither of these reads it.
    const above = headerOf(card) + bodyOf(card).textContent!;
    expect(above).toContain("nota-manguezais.md");
    expect(above).not.toContain("attachments/");
    expect(above).not.toContain(en.mangrove.actorPerson);
    expect(above).not.toContain(en.mangrove.audienceTenant);
  });

  // THE RECORD IS NOT THE BODY. A click on it must not open a sheet over the memory:
  // it is dense small print with controls in it, and the share panel lives there too.
  // THE REGIONS THAT ARE NOT THE BODY MUST NOT TOGGLE THE CARD. The claim moved
  // with the card's click: it used to be "these do not open the sheet", and the
  // sheet is no longer what a click does. What they must not do is open and close
  // the card under a member who was reading the record in it -- and the record is
  // only on screen at all while the card is open, so a click that closed it would
  // take away the thing being clicked.
  it("does not toggle the card when the record is clicked", async () => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    await render();
    const card = cards()[0];
    expect(card.getAttribute("role")).toBe("button");

    // Open it first: the record is behind the open now, so there is nothing to
    // click on a closed card.
    await act(async () => {
      bodyOf(card).querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card.getAttribute("aria-expanded")).toBe("true");

    for (const el of [
      // The byline band is `data-inner` for the same reason the record is: an avatar
      // and a gutter are not controls, and clicking either must not open a sheet.
      card.children[0],
      card.querySelector("footer")!,
      card.querySelector("footer dt")!,
      card.querySelector("footer dd")!,
    ]) {
      await act(async () => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(card.getAttribute("aria-expanded"), "a click on a region closed the card").toBe(
        "true",
      );
    }

    // And the body still does close it, so the guard above is not simply a card
    // that stopped answering clicks.
    await act(async () => {
      bodyOf(card).querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card.getAttribute("aria-expanded")).toBe("false");
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

/** Somebody else's, and newer than anything in FOUR. */
const FRESH = {
  ...THEIRS,
  cell: "fresh",
  object: { ...MINE.object, id: "mangrove:obj:fresh", cell: "fresh" },
  published: "2026-09-22T14:00:00Z",
};

const SEEN_KEY = "mangrove-seen:t1:s1:";
const NOON = String(Date.parse("2026-09-22T12:00:00Z"));

/** The rail's entries, by their labels, in order -- the badge is a sibling span. */
function railLabels(): string[] {
  const nav = host!.querySelector("nav")!;
  return [...nav.querySelectorAll("button")].map((b) => b.querySelector("span")!.textContent!);
}

/** The count shown beside the feed, or null where there is none. */
function feedBadge(): string | null {
  const feed = host!.querySelector("nav")!.querySelector("button")!;
  const spans = [...feed.querySelectorAll("span")];
  return spans.length > 1 ? spans[1].textContent : null;
}

describe("the rail of destinations", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    localStorage.clear();
  });

  // THE ORDER IS THE SCREEN'S ARGUMENT, so it is asserted whole rather than by
  // checking that writing comes "somewhere after" reading.
  it("reads first and writes second, with the directory last", async () => {
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: false });
    await render();
    expect(railLabels()).toEqual([
      en.mangrove.received,
      en.mangrove.compose,
      en.mangrove.published,
      en.mangrove.pending,
      en.mangrove.people,
    ]);
  });

  // Absent and not disabled, which is the rule the reading itself already follows.
  it("leaves the decisions out entirely for somebody who governs nothing", async () => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    await render();
    expect(railLabels()).not.toContain(en.mangrove.pending);
  });
});

describe("what arrived since the last visit", () => {
  beforeEach(() => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    localStorage.clear();
  });

  it("counts other people's, and not the member's own", async () => {
    localStorage.setItem(SEEN_KEY, NOON);
    // MINE and BY_MY_AGENT are at 13:00 and newer than the mark -- and are the
    // member's own, so announcing them back would be reporting their own post as news.
    // THEIRS and TO_THE_TENANT are at 11:00 and older. Only FRESH counts.
    readTimeline.mockResolvedValue({ ...FOUR, claims: [...FOUR.claims, FRESH] });
    await render();
    expect(feedBadge()).toBe("1");
  });

  it("shows nothing when nothing is newer than the mark", async () => {
    localStorage.setItem(SEEN_KEY, String(Date.parse("2026-09-23T00:00:00Z")));
    readTimeline.mockResolvedValue({ ...FOUR, claims: [...FOUR.claims, FRESH] });
    await render();
    expect(feedBadge()).toBeNull();
  });

  // THE BADGE SURVIVES THE VISIT THAT EARNED IT AND NOT THE NEXT ONE. The watermark is
  // written while the feed is on screen, so the member reads the three new cards with
  // the count still beside them -- and comes back to a clean rail.
  it("marks the feed as seen, so the same arrivals are not new twice", async () => {
    localStorage.setItem(SEEN_KEY, NOON);
    readTimeline.mockResolvedValue({ ...FOUR, claims: [...FOUR.claims, FRESH] });
    await render();
    expect(feedBadge()).toBe("1");
    expect(localStorage.getItem(SEEN_KEY)).toBe(String(Date.parse(FRESH.published)));

    await render();
    expect(feedBadge()).toBeNull();
  });
});

/** The card whose memory is about this cell -- which, for prose, is its header. */
function cardOf(cell: string): HTMLLIElement {
  return cards().find((li) => headerOf(li) === cell)!;
}

const SENDER = en.mangrove.senderLabel;
const RECIPIENTS = en.mangrove.recipientsLabel;
const ID = en.mangrove.identifierLabel;
const ENDORSED = en.mangrove.endorsedLabel;

describe("who produced a memory", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  // EXACT VALUES AND THE WHOLE SET OF HEADINGS, because "you" is a prefix of "your
  // agent" and because a column that appeared out of nowhere would otherwise pass.
  it("reads as you when your own person wrote it", async () => {
    await render();
    const card = cardOf("mine");
    expect(labelsOf(card)).toEqual([RECIPIENTS, ID]);
    expect(bylineOf(card)).toBe(`${SENDER} ${en.mangrove.actorYou}`);
    expect(field(card, ID)).toBe("mine");
  });

  // THE SHAPE, WHICH IS READ BEFORE THE SENTENCE IS. `actorLabel` answers person or
  // agent in words and throws the distinction away as a value, so the byline takes it
  // from `actorKind` -- and without this the two glyphs could collapse into one
  // without a single test noticing.
  it("draws a bot beside an agent and a person beside a human", async () => {
    await render();
    expect(bylineGlyph(cardOf("agents"))).toContain("lucide-bot");
    expect(bylineGlyph(cardOf("mine"))).toContain("lucide-user");
    expect(bylineGlyph(cardOf("theirs"))).toContain("lucide-user");
  });

  it("reads as your agent when your agent wrote it", async () => {
    await render();
    expect(bylineOf(cardOf("agents"))).toBe(`${SENDER} ${en.mangrove.actorYourAgent}`);
  });

  // Neither of the two the app can resolve -- and no invented name either. An
  // arbitrary actor cannot be looked up, so the kind is named and the id stays.
  it("reads as neither when somebody else wrote it, and keeps their id", async () => {
    await render();
    expect(bylineOf(cardOf("theirs"))).toBe(`${SENDER} ${en.mangrove.actorPerson} (alice)`);
  });

  // The byline must never be wrong, and identity arrives a beat after the first
  // paint -- so the impersonal form is what a not-yet-known member's own post reads
  // as, rather than a guess that would have to be corrected.
  it("says a person rather than you while the member's own ids are unknown", async () => {
    readIdentity.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    await render();
    const card = cardOf("mine");
    expect(bylineOf(card)).toBe(`${SENDER} ${en.mangrove.actorPerson} (me)`);
    // Not theirs to call private either: without the member's own ids, an empty
    // audience is not known to mean "only you".
    expect(labelsOf(card)).toEqual([ID]);
  });
});

describe("who a memory was shared with", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
    // Answering with nothing is the ordinary case -- an actor this subscription
    // does not contain. Set explicitly so a test that hovers is not relying on
    // the component's catch to stand in for a reply.
    resolveActors.mockResolvedValue([]);
  });

  // FOUR KINDS, FOUR GLYPHS. The kind is the part of a recipient that carries
  // information at a glance -- one colleague, their agent, the whole
  // subscription, the whole tenant -- and it was being thrown away at the last
  // step, leaving four rows that differed only in a uuid.
  it("draws a face per kind, and never the raw id", async () => {
    await render();
    expect(facesOf(cardOf("theirs"))).toEqual([
      ["lucide-user", `${en.mangrove.actorPerson} (bob)`],
    ]);
    expect(facesOf(cardOf("agents"))).toEqual([
      ["lucide-users", en.mangrove.audienceSubscription],
    ]);
    expect(facesOf(cardOf("everybody"))).toEqual([
      ["lucide-building2", en.mangrove.audienceTenant],
    ]);
    // The literal words the two group ids used to render as.
    expect(cardOf("agents").textContent).not.toContain("mangrove:group:");
  });

  it("tells an agent apart from the person who owns it", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [{ ...THEIRS, audience: ["mangrove:actor:bob:service"] }],
      held: [],
    });
    await render();
    expect(facesOf(cardOf("theirs"))).toEqual([
      ["lucide-bot", `${en.mangrove.actorAgent} (bob)`],
    ]);
  });

  // THE NAME IS ASKED FOR ON HOVER AND NOT BEFORE. A reading is a list of cards,
  // and naming every recipient of every one of them eagerly is a burst of
  // requests for something nobody asked to see.
  it("looks a person up only when the face is pointed at, and then says who", async () => {
    resolveActors.mockResolvedValue([
      { id: "mangrove:actor:bob:person", email: "bob@example.test" },
    ]);
    await render();
    const face = cardOf("theirs").querySelector("footer dd button")!;
    expect(resolveActors).not.toHaveBeenCalled();

    await act(async () => {
      face.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(resolveActors).toHaveBeenCalledWith(workspace, ["mangrove:actor:bob:person"]);

    // FROM THE DOCUMENT, NOT FROM THE CARD. The tooltip is portalled out: the
    // card is `overflow-hidden` and the recipients column sits at its left edge,
    // so a tooltip centred on a face was cut in half by the card's own boundary.
    const tip = tooltip()!;
    expect(tip.textContent).toContain("bob@example.test");
    expect(cardOf("theirs").contains(tip), "back inside the box that clipped it").toBe(
      false,
    );
    // AND THE CONTROL IS RENAMED WITH IT, so the answer is not only visual.
    expect(cardOf("theirs").querySelector("footer dd button")!.getAttribute("aria-label")).toBe(
      "bob@example.test",
    );
  });

  // The subscription's name is held by the app already. Asking the directory for
  // it would be a request for a string on the other side of the same screen.
  it("names the subscription from what the shell already resolved", async () => {
    await render();
    const face = cardOf("agents").querySelector("footer dd button")!;
    await act(async () => {
      face.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(tooltip()!.textContent).toContain("Soil Lab");
    expect(resolveActors).not.toHaveBeenCalled();
  });

  // A FACE EACH, up to the point where a row of them stops being readable.
  it("shows every recipient until there are too many, then offers the rest", async () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => `mangrove:actor:p${i}:person`);
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [{ ...THEIRS, audience: many(8) }],
      held: [],
    });
    await render();
    const card = cardOf("theirs");
    expect(facesOf(card)).toHaveLength(6);

    const more = [...card.querySelectorAll("footer dd button")].find(
      (b) => b.textContent === "+2",
    )!;
    expect(more).toBeTruthy();
    await click(more);
    expect(facesOf(card)).toHaveLength(8);
    expect(card.textContent).toContain(en.mangrove.recipientsFewer);
  });

  it("offers nothing to expand when they all fit", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [{ ...THEIRS, audience: ["mangrove:actor:bob:person", "mangrove:actor:carol:person"] }],
      held: [],
    });
    await render();
    expect(facesOf(cardOf("theirs"))).toHaveLength(2);
    expect(cardOf("theirs").textContent).not.toContain("+");
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
    // A PERSON WITH NO ADDRESS: "only you" is a statement about an empty
    // audience, so it is drawn as the member themselves and resolves to nothing.
    expect(facesOf(cardOf("mine"))).toEqual([["lucide-user", en.mangrove.audiencePrivate]]);
    // ABSENT, not empty: a heading over a blank would be the same invention with
    // more furniture around it.
    expect(labelsOf(cardOf("theirs"))).toEqual([ID]);
    expect(cardOf("theirs").textContent).not.toContain(en.mangrove.audiencePrivate);
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

    // THE FOOTER, not the first `[data-inner]`: the byline band carries that attribute
    // too, and it is above this one.
    const panel = cardOf("mine").querySelector("footer")!;
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
    // AND THE READING IS RE-READ. The card's own record says who this memory reached,
    // and the panel sits in the same footer -- so leaving it as it was would print
    // "Recipients: only you" beside the word "Shared."
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

// WHAT HAPPENED TO THIS MEMORY, said on the card.
//
// The case that prompted this: a REVOKED memory was a card at reduced opacity and
// nothing else. Opacity says "something" and never says what, and it is the one
// signal that does not survive being read on a phone, in bright light, or by
// anyone who did not see the card before it changed.
//
// The other two that were lost are `held` and `pending`. Both were told apart
// only by the heading above their section — which is fine while the section is on
// screen and useless the moment a card is read anywhere else.
describe("what the card says happened", () => {
  const PROSE_CLAIM = { id: "mangrove:obj:1", type: "MemoryNote", cell: "soil-ph", content: "6.2" };

  beforeEach(() => {
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("says a live memory was published", async () => {
    readTimeline.mockResolvedValue(claimOf(PROSE_CLAIM));
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionPublished);
  });

  // THE ONE THIS FEATURE EXISTS FOR.
  it("says a revoked memory was revoked, rather than only dimming it", async () => {
    const t = claimOf(PROSE_CLAIM);
    readTimeline.mockResolvedValue({ ...t, claims: [{ ...t.claims[0], deleted: true }] });
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionRevoked);
  });

  // `deleted` WINS over the log's verb. A mangrove that has not shipped `action`
  // yet still answers with the tombstone, and that is the case with no word at all.
  it("reads the tombstone even when the log calls the winning write an update", async () => {
    const t = claimOf(PROSE_CLAIM);
    readTimeline.mockResolvedValue({
      ...t,
      claims: [{ ...t.claims[0], deleted: true, action: "updated" }],
    });
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionRevoked);
  });

  // The third verb comes from the mangrove, which is the only side that can say it
  // consistently: the timeline each reader gets is filtered to what they may see,
  // so a count taken in the client would differ from one member to the next.
  it("says a rewritten cell was updated, when the mangrove says so", async () => {
    const t = claimOf(PROSE_CLAIM);
    readTimeline.mockResolvedValue({ ...t, claims: [{ ...t.claims[0], action: "updated" }] });
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionUpdated);
  });

  // A mangrove that predates the field answers without it, and the card must not
  // go blank where it used to say nothing.
  it("falls back to published when the mangrove sends no verb", async () => {
    readTimeline.mockResolvedValue(claimOf(PROSE_CLAIM));
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionPublished);
  });

  // NOTHING IS "WAITING ON THE MEMBER" ANY MORE. This asserted the `held` badge
  // on a card in a list that no longer exists; what a directly shared item says
  // now is what it IS -- published -- with the unread mark carrying the only
  // thing the badge was really telling anybody.
  it("marks something shared straight with the member as published, not as a chore", async () => {
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [
        {
          cell: "soil-ph",
          author: "mangrove:actor:bob:service",
          object: PROSE_CLAIM,
          published: "2026-09-22T10:00:00Z",
          deleted: false,
          evidence: 0,
          audience: [],
          read: false,
        },
      ],
    });
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionPublished);
    expect(host!.querySelector("[data-unread]")).not.toBeNull();
  });

  it("marks something waiting on a governing role as a decision", async () => {
    readCapabilities.mockResolvedValue({ governs: true, tenantLicensed: false });
    readTimeline.mockResolvedValue({
      reading: "received",
      claims: [],
      held: [],
      pending: [
        {
          activityId: "act-pending",
          author: "mangrove:actor:bob:service",
          scope: "mangrove:group:subs",
          object: PROSE_CLAIM,
          published: "2026-09-22T10:00:00Z",
        },
      ],
    });
    await render();
    expect(actionOf(cardOf("soil-ph"))).toBe(en.mangrove.actionPending);
  });

  // FIVE STATES, FIVE WORDS. Two of them reading the same is the failure this
  // whole thing is about — a reader scanning a column cannot tell two cards apart.
  it("gives every state a word of its own, in both locales", () => {
    for (const [locale, dict] of Object.entries(chatCopy)) {
      const words = [
        dict.mangrove.actionPublished,
        dict.mangrove.actionUpdated,
        dict.mangrove.actionRevoked,
        dict.mangrove.actionPending,
      ];
      expect(new Set(words).size, `${locale}: ${words.join(" / ")}`).toBe(words.length);
    }
  });
});

// THE RAIL STAYS PUT WHILE THE FEED MOVES.
//
// Scrolling a long feed carried the destinations off the top with it, so changing
// where you were meant first scrolling back up to somewhere you were not reading.
//
// Asserted on the CLASS and not on layout, because jsdom computes none: what is
// being pinned here is that the two utilities travel together. `sticky` on a flex
// item that still stretches has nothing to travel within, and the property then
// looks like it simply did nothing — which is the version of this that ships.
describe("the destination rail", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue({ reading: "received", claims: [], held: [] });
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  // A CONTAINER QUERY, NOT `sm:`, and the difference is the whole reason this test
  // changed. The mangrove renders in the resizable right-hand pane now, whose minimum
  // is 240px -- and `sm:` asks the VIEWPORT, so on a desktop window it would keep a
  // 192px rail inside that pane and leave the feed nothing.
  it("stacks or sits beside the feed by its own width, not the window's", async () => {
    await render();
    const rail = host!.querySelector("nav")!;
    expect(rail.className).toContain("@[34rem]:flex-col");
    expect(rail.className, "a stretched flex item cannot stick").toContain(
      "@[34rem]:self-start",
    );
    expect(rail.className).toContain("@[34rem]:sticky");
    // No viewport breakpoint left on it: one of the two would win by specificity and
    // which one is not something a reader should have to work out.
    expect(rail.className.split(" ").filter((c) => c.startsWith("sm:"))).toEqual([]);
  });

  // THE NARROW FORM WRAPS, AND IT IS A PAIR. Below the threshold the rail was a
  // single scrolling line whose entries each carried the column's `w-full`, so one
  // entry filled the pane and the other four were behind a sideways gesture nothing
  // announces. Neither half fixes it alone: wrapping a row of pane-wide entries just
  // stacks them, and shrinking the entries without wrapping still overflows.
  it("wraps its entries instead of scrolling them out of reach when narrow", async () => {
    await render();
    const rail = host!.querySelector("nav")!;
    expect(rail.className).toContain("flex-wrap");
    expect(
      rail.className,
      "a wrapped rail must not also be a scroller -- that is the state being removed",
    ).not.toMatch(/(^|\s)overflow-x-auto(\s|$)/);

    for (const entry of rail.querySelectorAll("button")) {
      const cls = entry.className;
      expect(cls, "an entry as wide as the pane is one entry per line").not.toMatch(
        /(^|\s)w-full(\s|$)/,
      );
      expect(cls, "and it still fills the column when there is one").toContain(
        "@[34rem]:w-full",
      );
    }
  });

  // WHICH SIDE THE RAIL IS ON, and that the answer is a painting rather than a
  // reordering. Reversing the row leaves the nav first in the markup, which is what
  // keeps the narrow form's tabs ABOVE the cards from the same source order -- the
  // alternative, moving the nav after the feed and letting it fall into place, would
  // have put the tabs underneath everything they switch between.
  it("draws the rail to the right of the cards, still reading rail-then-feed", async () => {
    await render();
    const row = host!.querySelector("nav")!.parentElement!;
    expect(row.className).toContain("@[34rem]:flex-row-reverse");
    expect(
      row.className.split(" "),
      "plain flex-row would win or lose by order and put the rail back on the left",
    ).not.toContain("@[34rem]:flex-row");
    expect(row.firstElementChild, "the rail must stay first in the DOM").toBe(
      host!.querySelector("nav"),
    );
  });

  // The query measures the nearest container, so something has to BE one. Without this
  // every `@[34rem]:` class above is inert and the rail silently stays stacked.
  it("declares the container the query measures", async () => {
    await render();
    const rail = host!.querySelector("nav")!;
    expect(rail.closest(".\\@container"), "no @container ancestor to measure").not.toBeNull();
  });
});

