import { describe, expect, it } from "vitest";
import {
  blobUrl,
  publish,
  mergeFragment,
  parseGraphFragment,
  GRAPH_FRAGMENT_MEDIA_TYPE,
  type MangroveObject,
} from "./mangrove";
import type { Workspace } from "@/app/chat/fragment";

const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

// The two pieces of the timeline's new payload that can be read without a browser: where a
// published file's bytes are, and what a graph fragment turns out to contain.

describe("blobUrl", () => {
  it("carries the digest and the workspace the request is authorized against", () => {
    const url = new URL(blobUrl(workspace, "f".repeat(64)), "https://example.test");
    expect(url.pathname).toBe("/api/mangrove/blob");
    expect(url.searchParams.get("blob")).toBe("f".repeat(64));
    expect(url.searchParams.get("tenant_id")).toBe("acme");
    expect(url.searchParams.get("subs_acc_id")).toBe("growth");
    expect(url.searchParams.get("role")).toBe("alpha");
  });

  // Its OWN route, not the action one. That route reads every answer with res.json(), which
  // is the one thing a PDF is not.
  it("does not go through the action router", () => {
    expect(blobUrl(workspace, "abc")).not.toContain("/api/mangrove/blob/");
    expect(blobUrl(workspace, "abc").startsWith("/api/mangrove/blob?")).toBe(true);
  });
});

describe("parseGraphFragment", () => {
  const fragment: MangroveObject = {
    id: "mangrove:obj:1",
    type: "MemoryNote",
    cell: "mangroves",
    mediaType: GRAPH_FRAGMENT_MEDIA_TYPE,
    content: JSON.stringify({
      entities: [{ name: "Rhizophora", entityType: "species", observations: [] }],
      relations: [{ from: "Rhizophora", to: "Mangrove", relationType: "grows_in" }],
    }),
  };

  it("reads the entities and relations out of a fragment", () => {
    const out = parseGraphFragment(fragment)!;
    expect(out.entities.map((e) => e.name)).toEqual(["Rhizophora"]);
    expect(out.relations).toHaveLength(1);
  });

  it("answers null for prose, whatever the prose happens to look like", () => {
    expect(
      parseGraphFragment({ ...fragment, mediaType: "text/markdown" }),
    ).toBeNull();
  });

  // The JSON was written by another tenant's agent and crossed a network this deployment
  // does not own. Every one of these is an ordinary thing to receive, and the caller's
  // answer to null is to render the body as the text it turned out to be.
  it("never throws on a body it cannot read", () => {
    for (const content of ["", "{ truncated", "null", "[]", '{"entities":"no"}', "7"]) {
      expect(parseGraphFragment({ ...fragment, content })).toBeNull();
    }
  });

  // One entity extracted on its own has no relations, and the field is simply absent.
  it("treats missing relations as none, not as a malformed fragment", () => {
    const out = parseGraphFragment({
      ...fragment,
      content: JSON.stringify({ entities: [{ name: "Solo", entityType: "", observations: [] }] }),
    })!;
    expect(out.relations).toEqual([]);
  });
});

// A project's files and a project's graph are the project's. The proxy resolves
// a path or an entity name against a WORKSPACE, and each project is a separate
// one -- so the two calls that name one have to say which project they mean.
// Without it the same name resolves against the main workspace: a 404, or
// silently the wrong file of the same name.
describe("the project travels with the calls that resolve a name", () => {
  const inProject: Workspace = { ...workspace, p: "proj-1" };

  async function queryOf(fn: () => Promise<unknown>): Promise<URLSearchParams> {
    let seen = "";
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = original;
    }
    return new URL(seen, "https://example.test").searchParams;
  }

  it("publish carries it", async () => {
    const q = await queryOf(() =>
      publish(inProject, { file: "public/report.pdf" } as never),
    );
    expect(q.get("project")).toBe("proj-1");
  });

  it("merge carries it", async () => {
    const q = await queryOf(() => mergeFragment(inProject, "mangrove:obj:1"));
    expect(q.get("project")).toBe("proj-1");
  });

  it("and is absent outside one, rather than sent empty", async () => {
    const q = await queryOf(() => mergeFragment(workspace, "mangrove:obj:1"));
    expect(q.has("project")).toBe(false);
  });

  // Reading does not take it. The network is per subscription: a timeline is the
  // same timeline whichever project the member happens to have open, and a
  // digest names content in the mangrove's own store, not in a workspace.
  it("but a blob url does not, because a digest is not a path", () => {
    const url = new URL(blobUrl(inProject, "a".repeat(64)), "https://example.test");
    expect(url.searchParams.has("project")).toBe(false);
  });
});
