// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Writing into the mangrove.
//
// What this suite asserts is the part a member cannot see and cannot recover
// from: WHO the request says it is for. A reach picker that sent "both" when the
// sender chose "them" would put a memory in somebody's agent without them ever
// agreeing to it, and nothing on screen would say so.
//
// It also holds the two rules the screen exists to keep: a group option belongs
// only to somebody who may use it, and an empty audience is a publication, not
// a missing field.

const findPeople = vi.fn();
const publish = vi.fn();

vi.mock("@/lib/mangrove", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mangrove")>();
  return {
    ...actual,
    findPeople: (...a: unknown[]) => findPeople(...a),
    publish: (...a: unknown[]) => publish(...a),
  };
});

import MangroveCompose from "./mangrove-compose";
import type { MangroveShare } from "./mangrove-share-bus";
import { MangroveError, type MangroveCapabilities, type MangrovePublication } from "@/lib/mangrove";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;
const workspace = { t: "t1", s: "s1", r: "alpha" as const };

const NO_CAPS: MangroveCapabilities = { governs: false, tenantLicensed: false };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const published: boolean[] = [];

const removed: number[] = [];

async function render(
  caps: MangroveCapabilities | null = NO_CAPS,
  attachment: MangroveShare | null = null,
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MangroveCompose
        workspace={workspace}
        caps={caps}
        attachment={attachment}
        onRemoveAttachment={() => removed.push(1)}
        onPublished={(pending) => published.push(pending)}
      />,
    );
  });
  return host;
}

/** React listens for `input`/`change`, and a controlled field ignores a plain
 *  assignment -- so the native setter is called before the event is dispatched. */
async function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function byLabel<T extends Element>(label: string): T {
  return host!.querySelector<T>(`[aria-label="${label}"]`)!;
}

function byText(text: string): HTMLElement {
  const all = [...host!.querySelectorAll("button")];
  return all.find((b) => b.textContent?.trim() === text)!;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Choose one of the audience scopes. There is no combination to build. */
async function pickScope(labelText: string) {
  const radio = [...host!.querySelectorAll('[role="radio"]')].find((r) =>
    r.textContent?.trim() === labelText,
  );
  if (!radio) {
    throw new Error(
      `no scope offered called ${labelText}; offered: ${[...host!.querySelectorAll('[role="radio"]')]
        .map((r) => r.textContent?.trim())
        .join(", ")}`,
    );
  }
  await act(async () => {
    radio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Fill the two required fields. */
async function writeMemory(cell = "soil-ph", body = "pH 5.2 after liming.") {
  await setValue(host!.querySelector<HTMLInputElement>(`[placeholder="${en.mangrove.cellPlaceholder}"]`)!, cell);
  await setValue(host!.querySelector("textarea")!, body);
}

async function addRecipient(email: string) {
  // The finder lives under the People scope, because that is the only scope that
  // sends what it finds. Every caller that adds somebody is in that scope by
  // definition, so the helper puts itself there rather than making each test say so.
  await pickScope(en.mangrove.scopePeople);
  findPeople.mockResolvedValue({ mode: "exact", results: [{ email }] });
  await setValue(byLabel<HTMLInputElement>(en.mangrove.findPeople), email);
  await click(byText(en.mangrove.find));
  await click(byLabel(`${en.mangrove.addRecipient} — ${email}`));
}

async function send() {
  await act(async () => {
    host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function sent(): MangrovePublication {
  return publish.mock.calls[0][1] as MangrovePublication;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  published.length = 0;
  removed.length = 0;
  vi.clearAllMocks();
});

describe("group scopes", () => {
  it("offers no group at all to somebody who governs nothing", async () => {
    const el = await render({ governs: false, tenantLicensed: false });
    // ABSENT, not disabled: an affordance that renders and then refuses teaches
    // the wrong model of who decides.
    expect(el.textContent).not.toContain(en.mangrove.groupsLabel);
    expect(el.textContent).not.toContain(en.mangrove.groupSubscription);
    expect(el.textContent).not.toContain(en.mangrove.groupTenant);
  });

  it("offers the subscription to a governing role, and not the tenant", async () => {
    const el = await render({ governs: true, tenantLicensed: false });
    expect(el.textContent).toContain(en.mangrove.groupSubscription);
    expect(el.textContent).not.toContain(en.mangrove.groupTenant);
  });

  it("offers the tenant only where it is licensed", async () => {
    const el = await render({ governs: false, tenantLicensed: true });
    expect(el.textContent).toContain(en.mangrove.groupTenant);
    expect(el.textContent).not.toContain(en.mangrove.groupSubscription);
  });

  it("offers nothing while the capabilities are still unknown", async () => {
    const el = await render(null);
    expect(el.textContent).not.toContain(en.mangrove.groupsLabel);
  });

  it("addresses a chosen group by its id", async () => {
    publish.mockResolvedValue({ activity: {}, pending: true });
    await render({ governs: true, tenantLicensed: true });
    await writeMemory();
    await pickScope(en.mangrove.groupSubscription);
    await send();

    expect(sent().to).toEqual(["mangrove:group:subscription:s1"]);
    expect(published).toEqual([true]);
  });

  // ONE ANSWER, NOT A COMBINATION. Choosing the tenant after the subscription
  // REPLACES it; the two cannot both travel, which is the whole point of the
  // control. Asserting the second choice alone is what would pass against a set
  // of checkboxes too, so the first is asserted as gone.
  it("replaces the scope rather than adding to it", async () => {
    publish.mockResolvedValue({ activity: {}, pending: true });
    await render({ governs: true, tenantLicensed: true });
    await writeMemory();
    await pickScope(en.mangrove.groupSubscription);
    await pickScope(en.mangrove.groupTenant);
    await send();

    expect(sent().to).toEqual(["mangrove:group:tenant:t1"]);
    expect(sent().to).not.toContain("mangrove:group:subscription:s1");
  });

  // Exactly one is checked at any moment, whatever the member clicked.
  it("never has two scopes checked", async () => {
    await render({ governs: true, tenantLicensed: true });
    const checked = () =>
      [...host!.querySelectorAll('[role="radio"]')].filter(
        (r) => r.getAttribute("aria-checked") === "true",
      ).length;

    expect(checked()).toBe(1);
    for (const label of [
      en.mangrove.scopePeople,
      en.mangrove.groupSubscription,
      en.mangrove.groupTenant,
      en.mangrove.scopePrivate,
    ]) {
      await pickScope(label);
      expect(checked()).toBe(1);
    }
  });

  // Picked people are KEPT when the member looks at another scope, and simply do
  // not travel. Switching back restores the list rather than punishing the look.
  it("keeps the people list across a scope change but does not send it", async () => {
    publish.mockResolvedValue({ activity: {}, pending: true });
    await render({ governs: true, tenantLicensed: true });
    await writeMemory();
    await pickScope(en.mangrove.scopePeople);
    await addRecipient("bob@x.test");
    await pickScope(en.mangrove.groupSubscription);
    await send();

    expect(sent().toEmails).toEqual([]);
    expect(sent().to).toEqual(["mangrove:group:subscription:s1"]);

    await pickScope(en.mangrove.scopePeople);
    expect(host!.textContent).toContain("bob@x.test");
  });

  // Private is an ANSWER, not the absence of one: it is offered, it is the
  // default, and it sends nothing.
  it("publishes to nobody under Only you", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render({ governs: true, tenantLicensed: true });
    await writeMemory();
    await send();

    expect(sent().to).toEqual([]);
    expect(sent().toEmails).toEqual([]);
  });
});

describe("who it reaches", () => {
  it("addresses somebody found by search by EMAIL, never by an id", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render();
    await writeMemory();
    // A deployment with prefix search DOES return an id -- and it is still not
    // what the request is built from, because a strict deployment returns none.
    findPeople.mockResolvedValue({
      mode: "prefix",
      results: [{ email: "bob@example.test", actorId: "mangrove:actor:bob:person" }],
    });
    await pickScope(en.mangrove.scopePeople);
    await setValue(byLabel<HTMLInputElement>(en.mangrove.findPeople), "bob");
    await click(byText(en.mangrove.find));
    await click(byLabel(`${en.mangrove.addRecipient} — bob@example.test`));
    await send();

    expect(sent().to).toEqual([]);
    expect(sent().toEmails).toEqual([{ email: "bob@example.test", person: true, agent: false }]);
  });

  it("sends to the agent alone when that is what was picked", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render();
    await writeMemory();
    await addRecipient("bob@example.test");
    await setValue(
      byLabel<HTMLSelectElement>(`${en.mangrove.reachLabel} — bob@example.test`),
      "agent",
    );
    await send();

    expect(sent().toEmails).toEqual([{ email: "bob@example.test", person: false, agent: true }]);
  });

  it("sends to both when both were picked", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render();
    await writeMemory();
    await addRecipient("bob@example.test");
    await setValue(
      byLabel<HTMLSelectElement>(`${en.mangrove.reachLabel} — bob@example.test`),
      "both",
    );
    await send();

    expect(sent().toEmails).toEqual([{ email: "bob@example.test", person: true, agent: true }]);
  });

  it("drops somebody taken off the list again", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render();
    await writeMemory();
    await addRecipient("bob@example.test");
    await click(byLabel(`${en.mangrove.removeRecipient} — bob@example.test`));
    await send();

    expect(sent().toEmails).toEqual([]);
  });
});

describe("an empty audience", () => {
  it("is a publication, not a missing field", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    const el = await render();
    await writeMemory();
    // Private is the DEFAULT and it says what it means. It used to be the state
    // left over from choosing nothing, described by a line that only appeared
    // while nothing was chosen; it is an option now, checked on arrival.
    expect(el.textContent).toContain(en.mangrove.scopePrivateNote);
    const checked = [...host!.querySelectorAll('[role="radio"]')].find(
      (r) => r.getAttribute("aria-checked") === "true",
    );
    expect(checked?.textContent?.trim()).toBe(en.mangrove.scopePrivate);
    await send();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(sent().to).toEqual([]);
    expect(sent().toEmails).toEqual([]);
    expect(published).toEqual([false]);
  });
});

describe("the body", () => {
  it("sends the format the writer chose, rather than leaving it to be guessed", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render();
    await writeMemory("soil-ph", "* not a bullet *");
    await setValue(byLabel<HTMLSelectElement>(en.mangrove.formatLabel), "text/plain");
    await send();

    expect(sent().mediaType).toBe("text/plain");
    expect(sent().cell).toBe("soil-ph");
    expect(sent().content).toBe("* not a bullet *");
  });

  it("will not send without a cell or a body", async () => {
    await render();
    await send();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("a refusal", () => {
  it("shows the mangrove's own words, which name the addressee", async () => {
    publish.mockRejectedValue(
      new MangroveError("out of reach: bob@example.test (not in your subscription)"),
    );
    const el = await render();
    await writeMemory();
    await addRecipient("bob@example.test");
    await send();

    expect(el.textContent).toContain("out of reach: bob@example.test (not in your subscription)");
    // A generic failure here would leave the sender with nothing to fix.
    expect(el.textContent).not.toContain(en.mangrove.publishFailed);
    expect(published).toEqual([]);
  });

  it("translates the codes this client invented for itself", async () => {
    publish.mockRejectedValue(new MangroveError("mangrove_unreachable"));
    const el = await render();
    await writeMemory();
    await send();

    expect(el.textContent).toContain(en.mangrove.unreachable);
  });
});


// Sharing something that is NOT prose.
//
// The mangrove takes exactly one of a body, a file and a set of entities, and answers
// zero or two with a 400. What these assert is that the second half is unreachable from
// here: an attachment takes the prose fields off the screen, so there is no state in
// which the request carries both — and the field that DOES go is the one the proxy
// resolves, which for a file is the path and never the display name.
describe("a file attached from the files tab", () => {
  const FILE: MangroveShare = { kind: "file", path: "reports/q2.pdf", name: "q2.pdf" };

  it("takes the cell and body fields off the screen", async () => {
    const el = await render(NO_CAPS, FILE);
    expect(el.querySelector("textarea")).toBeNull();
    expect(
      el.querySelector(`[placeholder="${en.mangrove.cellPlaceholder}"]`),
    ).toBeNull();
    expect(el.textContent).toContain(en.mangrove.attachedFile);
    expect(el.textContent).toContain("q2.pdf");
  });

  it("sends the PATH as `file`, and no content at all", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render(NO_CAPS, FILE);
    await send();

    const out = sent();
    expect(out.file).toBe("reports/q2.pdf");
    // The three the mangrove refuses together.
    expect(out.content).toBeUndefined();
    expect(out.cell).toBeUndefined();
    expect(out.entities).toBeUndefined();
    expect(published).toEqual([false]);
  });

  it("sends with nobody chosen, because the audience is still optional", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    await render(NO_CAPS, FILE);
    await send();
    expect(sent().to).toEqual([]);
    expect(sent().toEmails).toEqual([]);
  });

  it("offers a way back to writing prose", async () => {
    await render(NO_CAPS, FILE);
    await click(byLabel(en.mangrove.removeAttachment));
    expect(removed).toEqual([1]);
  });
});

describe("entities attached from the knowledge graph", () => {
  const ENTITIES: MangroveShare = { kind: "entities", names: ["Rhizophora", "Mangrove"] };

  it("sends the names as `entities`, and nothing else", async () => {
    publish.mockResolvedValue({ activity: {}, pending: false });
    const el = await render(NO_CAPS, ENTITIES);
    expect(el.textContent).toContain(
      en.mangrove.attachedEntitiesMany.replace("{count}", "2"),
    );
    await send();

    const out = sent();
    expect(out.entities).toEqual(["Rhizophora", "Mangrove"]);
    expect(out.content).toBeUndefined();
    expect(out.file).toBeUndefined();
    expect(out.cell).toBeUndefined();
  });

  it("still addresses a group when one was chosen", async () => {
    publish.mockResolvedValue({ activity: {}, pending: true });
    await render({ governs: true, tenantLicensed: false }, ENTITIES);
    await pickScope(en.mangrove.groupSubscription);
    await send();

    expect(sent().to).toEqual(["mangrove:group:subscription:s1"]);
    expect(sent().entities).toEqual(["Rhizophora", "Mangrove"]);
  });
});

// A hidden input is still tabbable. Under another scope the finder must not be
// in the document at all, or a keyboard user lands in a search box for
// recipients the post is not going to have.
describe("the people finder", () => {
  it("is absent under another scope, not merely hidden", async () => {
    await render({ governs: true, tenantLicensed: false });
    await pickScope(en.mangrove.scopePeople);
    expect(host!.querySelector(`[aria-label="${en.mangrove.findPeople}"]`)).not.toBeNull();

    await pickScope(en.mangrove.groupSubscription);
    expect(host!.querySelector(`[aria-label="${en.mangrove.findPeople}"]`)).toBeNull();
    expect(host!.querySelectorAll("input[type=text], textarea").length).toBeLessThan(3);
  });
});
