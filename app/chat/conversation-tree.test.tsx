// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ConversationSummary } from "@/lib/chatSession";
import type { Workspace } from "./fragment";

// The tree is the conversation list now — the flat one and the switch between them are
// gone. What that move had to carry with it is what this file pins: the actions a row
// offers, and the two pieces of chrome the owner asked to be rid of.

const histories: Record<string, { role: string; content: string; created_at?: string }[]> = {};
vi.mock("./history-cache", () => ({
  getHistory: async (_w: unknown, c: { id: string }) => histories[c.id] ?? [],
}));
vi.mock("@/lib/chatSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSession")>();
  return { ...actual, onConversationsUpdated: () => () => {} };
});

const ConversationTree = (await import("./conversation-tree")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
const { commonCopy } = await import("@/lib/i18n/common");

const t = chatCopy.en.history;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

function conversation(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    role: "alpha",
    tenantId: "acme",
    subsAccId: "growth",
    title: "Parecer TBDC",
    updatedAt: Date.parse("2026-09-20T10:00:00Z"),
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project: null,
    ...over,
  } as ConversationSummary;
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  for (const k of Object.keys(histories)) delete histories[k];
});

async function mount(props: Partial<Parameters<typeof ConversationTree>[0]> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <ConversationTree workspace={workspace} conversations={[conversation()]} {...props} />,
    );
  });
  // The histories resolve on their own microtask, then the model builds.
  await act(async () => {});
  return host;
}

function byLabel(host: HTMLElement, label: string) {
  return host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
}

describe("deleting a conversation from the tree", () => {
  // The capability that had to move for the flat list to go: delete was list-only.
  it("offers delete on a row, and reports the whole conversation", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const asked: ConversationSummary[] = [];
    const host = await mount({ onDelete: (c) => asked.push(c) });

    const button = byLabel(host, t.deleteAria)!;
    expect(button).toBeTruthy();
    expect(button.getAttribute("title")).toBe(commonCopy.en.actions.delete);

    await act(async () => button.click());
    // The CONVERSATION, not the visit: the caller confirms and drops by id.
    expect(asked.map((c) => c.id)).toEqual(["c1"]);
  });

  // Same scoping the alias editor already had: the landing renders this tree read-only.
  it("offers nothing where no handler is passed", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount();
    expect(byLabel(host, t.deleteAria)).toBeNull();
    expect(byLabel(host, t.aliasAndTags)).toBeNull();
  });
});

describe("editing a conversation's alias and tags", () => {
  const open = async (host: HTMLElement) => {
    await act(async () => byLabel(host, t.aliasAndTags)!.click());
  };

  // A row is one VISIT of a thread. Inline, the editor pushed the rest of the timeline
  // down and named nothing, so "which of these am I editing" had to be remembered.
  it("opens as a dialog naming the conversation, not a panel under the row", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount({ onApply: () => {} });
    await open(host);

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog, "the editor did not open as a dialog").toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Portalled out of the panel, for the reason ConfirmDialog already records.
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.textContent).toContain("Parecer TBDC");
    expect(dialog.getAttribute("aria-label")).toBe("Parecer TBDC");
  });

  // One commit, not two. The check beside the alias field left the dialog open, so it read
  // as a save that had not worked; the foot of the dialog is the only place that saves now.
  it("offers exactly one way to commit", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount({ onApply: () => {} });
    await open(host);

    const dialog = document.querySelector('[role="dialog"]')!;
    const saves = [...dialog.querySelectorAll("button")].filter((b) =>
      [b.textContent?.trim(), b.getAttribute("aria-label")].includes(
        commonCopy.en.actions.save,
      ),
    );
    expect(saves).toHaveLength(1);
  });

  // The heading is what the LIST calls the thread, which is the alias wherever one is set.
  it("names it the way the list does, by the alias when there is one", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount({
      conversations: [conversation({ alias: "Contrato" })],
      onApply: () => {},
    });
    await open(host);

    expect(document.querySelector('[role="dialog"]')!.getAttribute("aria-label")).toBe(
      "Contrato",
    );
  });
});

describe("what a row no longer says", () => {
  // `·3` counted the messages in a visit. It read as an index into the conversation, and
  // it sat in the crowded right-hand end of the row with everything else.
  it("carries no message count", async () => {
    histories.c1 = [
      { role: "user", content: "primeira", created_at: "2026-09-20T10:00:00Z" },
      { role: "assistant", content: "segunda", created_at: "2026-09-20T10:01:00Z" },
      { role: "user", content: "terceira", created_at: "2026-09-20T10:02:00Z" },
    ];
    const host = await mount();
    expect(host.textContent).toContain("terceira");
    expect(host.textContent).not.toMatch(/·\s*3/);
  });

  // The badge marked the single most recent visit across every thread. It named a state
  // the row above it already shows by being first.
  it("carries no HEAD badge on the newest visit", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount();
    expect(host.textContent).toContain("olá");
    expect(host.textContent).not.toContain("HEAD");
  });
});

describe("when the date is shown", () => {
  /** The row's date cell, found by the one class combination only it carries. */
  const stamp = (host: HTMLElement) =>
    host.querySelector<HTMLElement>("span.text-\\[10px\\].opacity-0");

  it("sits under the message, not at the end of it", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount();

    const el = stamp(host)!;
    expect(el, "no small hover-only date cell").toBeTruthy();
    const text = host.querySelector<HTMLElement>("span.text-sm")!;
    // BELOW: the date follows the message in document order and is not its sibling on
    // the title line — that line is where it used to crowd the tags and the HEAD badge.
    expect(text.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.parentElement).not.toBe(el.parentElement);
  });

  it("is invisible until the row is hovered or focused, and always on without hover", async () => {
    histories.c1 = [{ role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" }];
    const host = await mount();

    const el = stamp(host)!;
    expect(el.className).toContain("group-hover:opacity-100");
    expect(el.className).toContain("group-focus-within:opacity-100");
    // A touch screen has no hover, and a date nobody can reach is worse than one that is
    // simply there.
    expect(el.className).toContain("max-md:opacity-100");
  });
});
