// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The two halves of "who do I share with, and how do they reach me".
//
// What this asserts is the privacy rule, not the layout: in the mode an
// administrator has NOT opened up, a result confirms the person is reachable
// and withholds their id -- and your OWN ids are shown regardless, because the
// switch that hides other people's must never take away your ability to hand
// out your own.

const findPeople = vi.fn();
const readIdentity = vi.fn();

vi.mock("@/lib/mangrove", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mangrove")>();
  return {
    ...actual,
    findPeople: (...a: unknown[]) => findPeople(...a),
    readIdentity: (...a: unknown[]) => readIdentity(...a),
  };
});

import MangrovePeople from "./mangrove-people";
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
    root!.render(<MangrovePeople workspace={workspace} />);
  });
  return host;
}

async function searchFor(needle: string) {
  const input = host!.querySelector("input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, needle);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = host!.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe("your own handles", () => {
  it("shows the ids you would give somebody, whatever the search mode is", async () => {
    readIdentity.mockResolvedValue({
      email: "alice@example.test",
      personId: "mangrove:actor:alice:person",
      serviceId: "mangrove:actor:alice:service",
    });
    findPeople.mockResolvedValue({ mode: "exact", results: [] });

    const el = await render();
    expect(el.textContent).toContain(en.mangrove.yourIdentity);
    expect(el.textContent).toContain("mangrove:actor:alice:service");
    expect(el.textContent).toContain("alice@example.test");
  });
});

describe("finding somebody", () => {
  it("withholds the id in strict mode and says to use the email", async () => {
    readIdentity.mockResolvedValue({ email: "a@x", personId: "p", serviceId: "s" });
    findPeople.mockResolvedValue({
      mode: "exact",
      results: [{ email: "bob@example.test" }],
    });

    const el = await render();
    await searchFor("bob@example.test");

    expect(el.textContent).toContain("bob@example.test");
    expect(el.textContent).toContain(en.mangrove.shareByEmail);
    // The id was never in the payload, so it must not be on screen.
    expect(el.textContent).not.toContain("mangrove:actor:bob");
  });

  it("shows the id when the administrator opened search up", async () => {
    readIdentity.mockResolvedValue({ email: "a@x", personId: "p", serviceId: "s" });
    findPeople.mockResolvedValue({
      mode: "prefix",
      results: [{ email: "bob@example.test", actorId: "mangrove:actor:bob:service" }],
    });

    const el = await render();
    await searchFor("bob");

    expect(el.textContent).toContain("mangrove:actor:bob:service");
    expect(el.textContent).not.toContain(en.mangrove.shareByEmail);
  });

  // The hint is how the member learns which question this deployment answers.
  // Without it, typing half an address and getting nothing reads as the person
  // not existing.
  it("says which question it can answer", async () => {
    readIdentity.mockResolvedValue({ email: "a@x", personId: "p", serviceId: "s" });
    findPeople.mockResolvedValue({ mode: "prefix", results: [] });

    const el = await render();
    expect(el.textContent).toContain(en.mangrove.findHintExact);

    await searchFor("bob");
    expect(el.textContent).toContain(en.mangrove.findHintPrefix);
  });

  it("treats no match as an answer, not a failure", async () => {
    readIdentity.mockResolvedValue({ email: "a@x", personId: "p", serviceId: "s" });
    findPeople.mockResolvedValue({ mode: "exact", results: [] });

    const el = await render();
    await searchFor("nobody@example.test");

    expect(el.textContent).toContain(en.mangrove.findNone);
    expect(el.textContent).not.toContain(en.mangrove.findFailed);
  });
});
