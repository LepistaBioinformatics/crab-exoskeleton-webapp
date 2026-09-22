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
const mergeFragment = vi.fn();
const downloadBlob = vi.fn();

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
      { kind: "mangrove", objectId: "mangrove:obj:prose", cell: "soil-ph", author: "bob (bot)" },
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
