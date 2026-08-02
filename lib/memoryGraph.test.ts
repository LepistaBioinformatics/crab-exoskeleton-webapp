import { describe, it, expect, vi, afterEach } from "vitest";
import {
  openNodes,
  readGraph,
  recentChanges,
  entitySources,
  entityTypeCounts,
  relationsFor,
  searchGraph,
  type Relation,
  type SummaryGraph,
} from "./memoryGraph";
import type { Workspace } from "@/app/chat/fragment";

const workspace: Workspace = { t: "tenant-1", s: "subs-1", r: "alpha" } as Workspace;

function mockJSON(body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function calledURL(mock: ReturnType<typeof vi.fn>): URL {
  return new URL(mock.mock.calls[0][0] as string, "http://localhost");
}

describe("relationsFor", () => {
  const relations: Relation[] = [
    { from: "alice", to: "ledger", relationType: "maintains" },
    { from: "bob", to: "alice", relationType: "reviews for" },
    { from: "bob", to: "ledger", relationType: "audits" },
  ];

  it("returns edges in both directions", () => {
    const got = relationsFor(relations, "alice");
    expect(got.map((r) => r.relationType).sort()).toEqual(["maintains", "reviews for"]);
  });

  it("returns nothing for an entity with no edges", () => {
    expect(relationsFor(relations, "orphan")).toEqual([]);
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(relations);
    relationsFor(relations, "alice");
    expect(relations).toEqual(copy);
  });

  // The reason this function exists. If a future change points the detail pane at
  // openNodes' own `relations` instead, this is the assertion that explains why the
  // pane went blank.
  it("is needed because open_nodes drops single-entity relations", () => {
    // open_nodes keeps only edges whose BOTH endpoints were requested, so one name
    // yields none — even though the entity has two.
    const asOpenNodesWouldReturn = relations.filter(
      (r) => ["alice"].includes(r.from) && ["alice"].includes(r.to),
    );
    expect(asOpenNodesWouldReturn).toEqual([]);
    expect(relationsFor(relations, "alice")).toHaveLength(2);
  });
});

describe("readGraph", () => {
  it("asks for the summary projection and forwards the workspace", async () => {
    const empty: SummaryGraph = { entities: [], relations: [], totalObservations: 0 };
    const mock = mockJSON(empty);
    await readGraph(workspace);
    const url = calledURL(mock);
    expect(url.pathname).toBe("/api/memory-graph");
    expect(url.searchParams.get("detail_level")).toBe("summary");
    expect(url.searchParams.get("tenant_id")).toBe("tenant-1");
    expect(url.searchParams.get("subs_acc_id")).toBe("subs-1");
    // `role` picks the gateway service path in the BFF; it must be sent to OUR
    // route (which strips it) rather than omitted.
    expect(url.searchParams.get("role")).toBe("alpha");
  });

  it("omits the include flags unless asked", async () => {
    const mock = mockJSON({ entities: [], relations: [], totalObservations: 0 });
    await readGraph(workspace);
    const url = calledURL(mock);
    expect(url.searchParams.has("include_archived")).toBe(false);
    expect(url.searchParams.has("include_merged")).toBe(false);
  });

  it("sends the include flags when asked", async () => {
    const mock = mockJSON({ entities: [], relations: [], totalObservations: 0 });
    await readGraph(workspace, { includeArchived: true, includeMerged: true });
    const url = calledURL(mock);
    expect(url.searchParams.get("include_archived")).toBe("true");
    expect(url.searchParams.get("include_merged")).toBe("true");
  });

  // The summary projection names the entity's type `type`; only the full one uses
  // `entityType`. Pinned here because reading the wrong field renders a blank badge
  // on every row and still type-checks if the shapes are conflated.
  it("keeps the summary projection's `type` field", async () => {
    mockJSON({
      entities: [
        { name: "ledger", type: "system", observationCount: 2, firstObservation: "x", relationCount: 1 },
      ],
      relations: [],
      totalObservations: 2,
    });
    const graph = await readGraph(workspace);
    expect(graph.entities[0].type).toBe("system");
    expect(graph.entities[0]).not.toHaveProperty("entityType");
  });
});

describe("openNodes", () => {
  it("joins names with a comma", async () => {
    const mock = mockJSON({ entities: [], relations: [] });
    await openNodes(workspace, ["alice", "ledger"]);
    expect(calledURL(mock).searchParams.get("names")).toBe("alice,ledger");
  });
});

describe("searchGraph", () => {
  it("sends the query and the default k", async () => {
    const mock = mockJSON({ entities: [], relations: [], searchResults: [], searchType: "lexical" });
    await searchGraph(workspace, "rust");
    const url = calledURL(mock);
    expect(url.pathname).toBe("/api/memory-graph/search");
    expect(url.searchParams.get("query")).toBe("rust");
    expect(url.searchParams.get("k")).toBe("10");
  });

  // snake_case inside a camelCase envelope — deliberate upstream fidelity, and the
  // kind of thing a "cleanup" would silently break.
  it("preserves the snake_case hit field", async () => {
    mockJSON({
      entities: [],
      relations: [],
      searchResults: [{ entity_name: "ledger", score: 1 }],
      searchType: "lexical",
    });
    const res = await searchGraph(workspace, "rust");
    expect(res.searchResults[0].entity_name).toBe("ledger");
    expect(res.searchType).toBe("lexical");
  });
});

describe("recentChanges", () => {
  it("defaults to a 24h window", async () => {
    const mock = mockJSON({ recentEntities: [], recentRelations: [], recentObservations: [] });
    await recentChanges(workspace);
    expect(calledURL(mock).searchParams.get("hours")).toBe("24");
  });
});

describe("error handling", () => {
  it("throws an error code the i18n layer can render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "forbidden" }),
      })) as unknown as typeof fetch,
    );
    await expect(readGraph(workspace)).rejects.toThrow();
  });
});

describe("entitySources", () => {
  const base = { name: "e", entityType: "t" };

  it("returns nothing when no record carries provenance", () => {
    expect(
      entitySources({ ...base, observations: [{ content: "x", timestamp: 1 }] }),
    ).toEqual([]);
  });

  it("dedupes a conversation that produced several observations", () => {
    const got = entitySources({
      ...base,
      observations: [
        { content: "a", timestamp: 10, sourceSessionId: "conv-1" },
        { content: "b", timestamp: 20, sourceSessionId: "conv-1" },
        { content: "c", timestamp: 30, sourceSessionId: "conv-2" },
      ],
    });
    expect(got.map((s) => s.sessionId)).toEqual(["conv-2", "conv-1"]);
  });

  // Newest first: the chat a member wants is almost always the recent one, and an
  // entity built over months can carry a dozen sources.
  it("orders by each conversation's newest contribution", () => {
    const got = entitySources({
      ...base,
      observations: [
        { content: "old", timestamp: 1, sourceSessionId: "conv-old" },
        { content: "new", timestamp: 999, sourceSessionId: "conv-new" },
        { content: "older still", timestamp: 0, sourceSessionId: "conv-old" },
      ],
    });
    expect(got.map((s) => s.sessionId)).toEqual(["conv-new", "conv-old"]);
    expect(got[1].at).toBe(1); // the NEWEST of conv-old's two, not the oldest
  });

  it("includes the conversation that created the entity", () => {
    const got = entitySources({
      ...base,
      createdAt: 5,
      sourceSessionId: "conv-created",
      observations: [{ content: "a", timestamp: 50, sourceSessionId: "conv-later" }],
    });
    expect(got.map((s) => s.sessionId)).toEqual(["conv-later", "conv-created"]);
  });

  it("mixes attributed and unattributed observations without inventing a source", () => {
    const got = entitySources({
      ...base,
      observations: [
        { content: "a", timestamp: 10, sourceSessionId: "conv-1" },
        { content: "b", timestamp: 20 },
      ],
    });
    expect(got.map((s) => s.sessionId)).toEqual(["conv-1"]);
  });
});

describe("entityTypeCounts", () => {
  it("counts each type and orders by frequency", () => {
    expect(
      entityTypeCounts([
        { type: "pessoa" },
        { type: "projeto" },
        { type: "pessoa" },
        { type: "pessoa" },
        { type: "projeto" },
        { type: "tema" },
      ]),
    ).toEqual([
      { type: "pessoa", count: 3 },
      { type: "projeto", count: 2 },
      { type: "tema", count: 1 },
    ]);
  });

  // Stable between reads: the panel re-fetches on every visit, and chips that
  // reshuffled on equal counts would look like the graph changed when it did not.
  it("breaks ties alphabetically", () => {
    expect(entityTypeCounts([{ type: "zeta" }, { type: "alpha" }]).map((t) => t.type)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("ignores entities with no type", () => {
    expect(entityTypeCounts([{ type: "" }, { type: "pessoa" }])).toEqual([
      { type: "pessoa", count: 1 },
    ]);
  });

  it("returns nothing for an empty graph", () => {
    expect(entityTypeCounts([])).toEqual([]);
  });
});
