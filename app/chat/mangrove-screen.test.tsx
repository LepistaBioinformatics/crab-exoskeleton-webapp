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

/** The card's regions, in the order they are rendered. */
function regionsOf(li: HTMLLIElement): string[] {
  return [...li.children].map((el) => el.tagName);
}

/** What the card says it IS, above the body. */
function headerOf(li: HTMLLIElement): string {
  return li.querySelector("header")!.textContent!;
}

/** The body: the region between the header and the record. */
function bodyOf(li: HTMLLIElement): Element {
  return li.children[1];
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

  it("renders them most recent first, whatever order they arrived in", async () => {
    readTimeline.mockResolvedValue(claimsOf(...SHUFFLED));
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });

    await render();
    // Prose is headed by its cell, so the cards' own headers are the order.
    const order = cards().map(headerOf);
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

    // On a paragraph of the body, which is card and not control -- the event bubbles
    // to the card the way a click anywhere in its body does.
    await act(async () => {
      bodyOf(card)
        .querySelector("p")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
      bodyOf(card)
        .querySelector("p")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
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

  it("lays every card out as a header, a body and a record, in that order", async () => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    await render();
    expect(regionsOf(cards()[0])).toEqual(["HEADER", "DIV", "FOOTER"]);

    readTimeline.mockResolvedValue(SHARED_FILE);
    await render();
    expect(regionsOf(cards()[0])).toEqual(["HEADER", "DIV", "FOOTER"]);

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
    expect(regionsOf(cards()[0])).toEqual(["HEADER", "DIV", "FOOTER"]);
    expect(headerOf(cards()[0])).toBe(en.mangrove.fragmentTitle);
    expect(field(cards()[0], ID)).toBe("graph:b8d28853aae5");
  });

  // ASSERTED ON A FILE, because it is the kind whose header and whose identifier are
  // different strings -- `nota-manguezais.md` against `attachments/nota-manguezais.md`.
  // On prose the two are one thing, and "the identifier is not above the body" would be
  // a claim about a coincidence.
  it("carries the sender, the recipients and the identifier, and none of them above the body", async () => {
    readTimeline.mockResolvedValue(SHARED_FILE);
    await render();
    const card = cards()[0];

    expect(labelsOf(card)).toEqual([SENDER, RECIPIENTS, ID, ENDORSED]);
    expect(field(card, SENDER)).toBe(`${en.mangrove.actorPerson} (alice)`);
    expect(field(card, RECIPIENTS)).toBe(en.mangrove.audienceTenant);
    expect(field(card, ID)).toBe("attachments/nota-manguezais.md");
    expect(field(card, ENDORSED)).toBe("2");

    // The header says what the file IS, and nothing about where it came from.
    const above = headerOf(card) + bodyOf(card).textContent!;
    expect(above).toContain("nota-manguezais.md");
    expect(above).not.toContain("attachments/");
    expect(above).not.toContain(en.mangrove.actorPerson);
    expect(above).not.toContain(en.mangrove.audienceTenant);
  });

  // THE RECORD IS NOT THE BODY. A click on it must not open a sheet over the memory:
  // it is dense small print with controls in it, and the share panel lives there too.
  it("does not open the sheet when the record is clicked", async () => {
    readTimeline.mockResolvedValue(claimsOf({ cell: "soil-ph", published: "2026-09-22T10:00:00Z" }));
    await render();
    const card = cards()[0];
    // A card that really does have a sheet, or this asserts nothing.
    expect(card.getAttribute("role")).toBe("button");

    for (const el of [
      card.querySelector("footer")!,
      card.querySelector("footer dt")!,
      card.querySelector("footer dd")!,
    ]) {
      await act(async () => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }

    // And the body still does open it, so the guard above is not simply a card that
    // stopped working.
    await act(async () => {
      bodyOf(card).querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
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
    expect(labelsOf(card)).toEqual([SENDER, RECIPIENTS, ID]);
    expect(field(card, SENDER)).toBe(en.mangrove.actorYou);
    expect(field(card, ID)).toBe("mine");
  });

  it("reads as your agent when your agent wrote it", async () => {
    await render();
    expect(field(cardOf("agents"), SENDER)).toBe(en.mangrove.actorYourAgent);
  });

  // Neither of the two the app can resolve -- and no invented name either. An
  // arbitrary actor cannot be looked up, so the kind is named and the id stays.
  it("reads as neither when somebody else wrote it, and keeps their id", async () => {
    await render();
    expect(field(cardOf("theirs"), SENDER)).toBe(`${en.mangrove.actorPerson} (alice)`);
  });

  // The byline must never be wrong, and identity arrives a beat after the first
  // paint -- so the impersonal form is what a not-yet-known member's own post reads
  // as, rather than a guess that would have to be corrected.
  it("says a person rather than you while the member's own ids are unknown", async () => {
    readIdentity.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    await render();
    const card = cardOf("mine");
    expect(field(card, SENDER)).toBe(`${en.mangrove.actorPerson} (me)`);
    // Not theirs to call private either: without the member's own ids, an empty
    // audience is not known to mean "only you".
    expect(labelsOf(card)).toEqual([SENDER, ID]);
  });
});

describe("who a memory was shared with", () => {
  beforeEach(() => {
    readTimeline.mockResolvedValue(FOUR);
    readCapabilities.mockResolvedValue({ governs: false, tenantLicensed: false });
  });

  it("names a person, a subscription and a tenant, rather than printing the id", async () => {
    await render();
    expect(field(cardOf("theirs"), RECIPIENTS)).toBe(`${en.mangrove.actorPerson} (bob)`);
    expect(field(cardOf("agents"), RECIPIENTS)).toBe(en.mangrove.audienceSubscription);
    expect(field(cardOf("everybody"), RECIPIENTS)).toBe(en.mangrove.audienceTenant);
    // The literal words the two group ids used to render as.
    expect(cardOf("agents").textContent).not.toContain("mangrove:group:");
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
    expect(field(cardOf("mine"), RECIPIENTS)).toBe(en.mangrove.audiencePrivate);
    // ABSENT, not empty: a heading over a blank would be the same invention with
    // more furniture around it.
    expect(labelsOf(cardOf("theirs"))).toEqual([SENDER, ID]);
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
