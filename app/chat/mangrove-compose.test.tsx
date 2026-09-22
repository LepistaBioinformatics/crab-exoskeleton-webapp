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
import { MangroveError, type MangroveCapabilities, type MangrovePublication } from "@/lib/mangrove";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;
const workspace = { t: "t1", s: "s1", r: "alpha" as const };

const NO_CAPS: MangroveCapabilities = { governs: false, tenantLicensed: false };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const published: boolean[] = [];

async function render(caps: MangroveCapabilities | null = NO_CAPS) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MangroveCompose
        workspace={workspace}
        caps={caps}
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

async function checkbox(labelText: string) {
  const label = [...host!.querySelectorAll("label")].find((l) =>
    l.textContent?.includes(labelText),
  )!;
  const box = label.querySelector("input[type=checkbox]")!;
  await act(async () => {
    (box as HTMLInputElement).click();
  });
}

/** Fill the two required fields. */
async function writeMemory(cell = "soil-ph", body = "pH 5.2 after liming.") {
  await setValue(host!.querySelector<HTMLInputElement>(`[placeholder="${en.mangrove.cellPlaceholder}"]`)!, cell);
  await setValue(host!.querySelector("textarea")!, body);
}

async function addRecipient(email: string) {
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
    await checkbox(en.mangrove.groupSubscription);
    await checkbox(en.mangrove.groupTenant);
    await send();

    expect(sent().to).toEqual([
      "mangrove:group:subscription:s1",
      "mangrove:group:tenant:t1",
    ]);
    // A cross-scope publication is not delivered yet, and the screen is told so.
    expect(published).toEqual([true]);
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
    expect(el.textContent).toContain(en.mangrove.audienceNone);
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
