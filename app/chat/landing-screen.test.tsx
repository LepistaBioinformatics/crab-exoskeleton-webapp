// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ConversationSummary } from "@/lib/chatSession";

// FR-3, and the two claims a reader would otherwise have to take on trust: that nothing
// is created before the member sends, and that what IS created carries the project.
//
// The second is the invariant the deleted mint effect in ChatView existed to protect —
// a conversation created without the project is answered by the main agent and reads its
// history from the wrong workspace directory. It moved here, so the test moved here.

const created: { project: string | null }[] = [];
const enqueued: { sid: string; text: string; project: string | null }[] = [];
const navigated: { project: string | null; sid: string }[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

let list: ConversationSummary[] = [];
let loaded = true;

vi.mock("./use-conversations", () => ({
  useConversations: () => ({
    conversations: list,
    loaded,
    error: null,
    reload: async () => {},
    apply: () => {},
  }),
}));

vi.mock("@/lib/chatSession", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chatSession")>("@/lib/chatSession");
  return {
    ...actual,
    createConversation: async (_workspace: unknown, project: string | null) => {
      created.push({ project });
      return { id: "new-sid" };
    },
  };
});

vi.mock("./turn-store", async () => {
  const actual = await vi.importActual<typeof import("./turn-store")>("./turn-store");
  return {
    ...actual,
    enqueue: (sid: string, text: string, ctx: { project: string | null }) => {
      enqueued.push({ sid, text, project: ctx.project });
    },
  };
});

// `hv` decides list vs tree, exactly as it does in the sidebar. Stubbed rather than
// driven through `window.location.hash` so a test says which view it is asserting on.
let hv: string | undefined;

vi.mock("./fragment", async () => {
  const actual = await vi.importActual<typeof import("./fragment")>("./fragment");
  return {
    ...actual,
    useFragment: () => ({ hv }),
    setFragmentProjectSid: (project: string | null, sid: string) => {
      navigated.push({ project, sid });
    },
  };
});

// The tree measures its own layout and fetches its events; neither is what these tests
// are about. What matters here is WHICH conversations it is handed.
const treeRows: string[][] = [];
vi.mock("./conversation-tree", () => ({
  default: ({ conversations }: { conversations: ConversationSummary[] }) => {
    treeRows.push(conversations.map((c) => c.id));
    return <div data-tree="" />;
  },
}));

import LandingScreen from "./landing-screen";
import { chatCopy } from "@/lib/i18n/chat";

const t = chatCopy.en;

function conversation(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "c1",
    role: "alpha",
    tenantId: "acme",
    subsAccId: "growth",
    title: "Parecer TBDC",
    updatedAt: Date.parse("2026-09-10T10:00:00Z"),
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project: null,
    ...over,
  } as ConversationSummary;
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  created.length = 0;
  enqueued.length = 0;
  navigated.length = 0;
  list = [];
  loaded = true;
  hv = "list";
  treeRows.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(project: string | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LandingScreen
        workspace={{ t: "acme", s: "growth", r: "alpha", p: project }}
        project={project ? { id: project, name: "Legal", instructions: "", createdAt: "" } : null}
        onOpen={() => {}}
      />,
    );
  });
  return host!;
}

// A controlled textarea ignores a plain assignment: React's own value setter has to be
// bypassed for the change event to carry the new value.
async function type(el: HTMLElement, value: string) {
  const box = el.querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!
    .set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return box;
}

async function send(el: HTMLElement, text: string) {
  const box = await type(el, text);
  await act(async () => {
    box.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
  // Let the createConversation promise settle.
  await act(async () => {});
}

describe("LandingScreen", () => {
  // FR-3.5. The state this screen fills used to mint a conversation on sight, so every
  // place a member merely LOOKED at left an id in the fragment with no row behind it.
  it("creates nothing on arrival", async () => {
    await mount(null);
    expect(created).toEqual([]);
    expect(navigated).toEqual([]);
  });

  it("starts a conversation only when the member sends", async () => {
    const el = await mount(null);
    await send(el, "olá");
    expect(created).toHaveLength(1);
    expect(enqueued).toEqual([{ sid: "new-sid", text: "olá", project: null }]);
    expect(navigated).toEqual([{ project: null, sid: "new-sid" }]);
  });

  // FR-3.6, THE INVARIANT. Without the project the turn is answered by the main agent
  // and its history is read from the wrong workspace directory — which is the defect the
  // effect this screen replaced was written to prevent.
  it("carries the project into the conversation it creates", async () => {
    const el = await mount("legal");
    await send(el, "resumo do contrato");
    expect(created).toEqual([{ project: "legal" }]);
    expect(enqueued[0].project).toBe("legal");
    expect(navigated).toEqual([{ project: "legal", sid: "new-sid" }]);
  });

  it("says which project it is standing in", async () => {
    const el = await mount("legal");
    expect(el.textContent).toContain(t.landing.inProject.replace("{name}", "Legal"));
  });

  it("names no project at the agent's root", async () => {
    const el = await mount(null);
    expect(el.textContent).not.toContain("Legal");
  });

  it("lists the scope's conversations and opens one", async () => {
    list = [conversation({ id: "c1", title: "Parecer TBDC" })];
    const opened: string[] = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <LandingScreen
          workspace={{ t: "acme", s: "growth", r: "alpha", p: null }}
          project={null}
          onOpen={(id) => opened.push(id)}
        />,
      );
    });
    const button = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Parecer TBDC"),
    )!;
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toEqual(["c1"]);
  });

  // The alias is what the member named it; the title is what the first message made of
  // it. Same order the breadcrumb and the sidebar read them in.
  it("prefers the alias over the generated title", async () => {
    list = [conversation({ alias: "  Contrato  ", title: "Parecer TBDC" })];
    const el = await mount(null);
    expect(el.textContent).toContain("Contrato");
    expect(el.textContent).not.toContain("Parecer TBDC");
  });

  // The list starts empty and fills from an effect, and a member reaches this screen
  // four ways -- entering an agent, entering a project, New chat, and deleting the
  // conversation they were reading. Without this it said "no conversations yet" on every
  // one of them, for a tick, before the real list arrived.
  it("waits for the first read before saying there are none", async () => {
    loaded = false;
    const el = await mount(null);
    expect(el.textContent).not.toContain(t.history.noneYet);
  });

  it("says there are none once the read has come back empty", async () => {
    const el = await mount(null);
    expect(el.textContent).toContain(t.history.noneYet);
  });

  // "New chat" navigates HERE from every other screen. Pressed while already here it
  // writes the hash that is already in the bar, which fires no hashchange and re-renders
  // nothing -- so the press did nothing at all on the one screen a member is most likely
  // to press it from. The composer's own mount-focus does not help: it is keyed on
  // `sessionId`, which on the landing never changes.
  it("returns the cursor to the composer when new-chat is pressed from here", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const render = (signal: number) =>
      act(() => {
        root!.render(
          <LandingScreen
            workspace={{ t: "acme", s: "growth", r: "alpha", p: null }}
            project={null}
            onOpen={() => {}}
            focusSignal={signal}
          />,
        );
      });
    render(0);
    const box = host.querySelector("textarea")!;
    // The member has moved on -- scrolled the list, clicked something else.
    act(() => box.blur());
    expect(document.activeElement).not.toBe(box);

    render(1);
    expect(document.activeElement).toBe(box);
  });

  // THE DEFECT A MEMBER REPORTED AS "sometimes it opens the conversation and sometimes
  // it doesn't". `listConversations` sends tenant/subscription/role and NOT the project,
  // so it answers with every conversation of the agent. This screen listed all of them
  // under one project's name, and opening a row from another project wrote THIS
  // project's `p` beside that conversation's `sid` -- the transcript read from the wrong
  // workspace directory, came back empty, and the chat fell through to its "pick one or
  // start one" state.
  it("lists only the conversations of the project it is standing in", async () => {
    list = [
      conversation({ id: "root", project: null, title: "No projeto nenhum" }),
      conversation({ id: "legal", project: "legal", title: "Dentro do Legal" }),
      conversation({ id: "other", project: "hr", title: "De outro projeto" }),
    ];
    const el = await mount("legal");
    expect(el.textContent).toContain("Dentro do Legal");
    expect(el.textContent).not.toContain("No projeto nenhum");
    expect(el.textContent).not.toContain("De outro projeto");
  });

  it("lists only the agent's own conversations at its root", async () => {
    list = [
      conversation({ id: "root", project: null, title: "No projeto nenhum" }),
      conversation({ id: "legal", project: "legal", title: "Dentro do Legal" }),
    ];
    const el = await mount(null);
    expect(el.textContent).toContain("No projeto nenhum");
    expect(el.textContent).not.toContain("Dentro do Legal");
  });

  // Same key the sidebar reads, so the two never disagree about which view is on. The
  // switch itself stays in the sidebar: two controls for one setting is how they drift.
  describe("which view it draws", () => {
    it("draws the tree unless the member asked for a list", async () => {
      hv = undefined;
      list = [conversation({ id: "c1" })];
      const el = await mount(null);
      expect(el.querySelector("[data-tree]")).toBeTruthy();
      expect(treeRows).toEqual([["c1"]]);
    });

    it("draws a list when hv says list", async () => {
      hv = "list";
      list = [conversation({ id: "c1", title: "Parecer TBDC" })];
      const el = await mount(null);
      expect(el.querySelector("[data-tree]")).toBeNull();
      expect(el.textContent).toContain("Parecer TBDC");
    });

    // The tree gets the SAME narrowed list, not the raw one: it navigates itself with
    // `setFragmentSid`, which leaves `p` alone, so a row from another project would land
    // on the same wrong-workspace transcript the list did.
    it("hands the tree the project's conversations only", async () => {
      hv = undefined;
      list = [
        conversation({ id: "legal", project: "legal" }),
        conversation({ id: "other", project: "hr" }),
      ];
      await mount("legal");
      expect(treeRows).toEqual([["legal"]]);
    });
  });

  // OQ-1: there is no conversation to upload against yet, and the proxy stores an
  // attachment under a session. Omitted rather than disabled — a disabled control
  // swallows its own click.
  it("offers no attach control, rather than a dead one", async () => {
    const el = await mount(null);
    const attach = Array.from(el.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === t.composer.attach,
    );
    expect(attach).toBeUndefined();
  });
});
