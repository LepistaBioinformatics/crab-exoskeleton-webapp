import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  BrowseList,
  EntityDetail,
  RecentList,
  RelationLine,
  SearchList,
} from "./memory-graph-views";
import { chatCopy } from "@/lib/i18n/chat";
import type { Entity, RecentChanges, Relation, SummaryGraph } from "@/lib/memoryGraph";

// The suite runs `environment: "node"`, so effects never fire: these render the
// presentational pieces directly with the shapes the proxy actually returns. That
// matters more here than in most panels, because three of those shapes are easy to
// read wrongly in a way that compiles and renders BLANK — the summary projection's
// `type` (not `entityType`), an absent `confidence` (not zero), and epoch
// milliseconds (not seconds).

const t = chatCopy.en;
const g = t.memoryGraph;

// renderToStaticMarkup HTML-escapes text, so copy containing an apostrophe comes
// back as `&#x27;`. Unescape rather than rewrite the copy to suit the test — the
// English string is the one a member reads.
function text(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const relations: Relation[] = [
  { from: "alice", to: "ledger", relationType: "maintains" },
  { from: "bob", to: "alice", relationType: "reviews for" },
];

const summary: SummaryGraph = {
  entities: [
    {
      name: "ledger",
      type: "system",
      observationCount: 3,
      firstObservation: "written in Rust",
      relationCount: 1,
    },
    { name: "empty-one", type: "note", observationCount: 0, relationCount: 0 },
  ],
  relations,
  totalObservations: 3,
};

function browse(over: Partial<Parameters<typeof BrowseList>[0]> = {}) {
  return renderToStaticMarkup(
    <BrowseList
      graph={summary}
      selected={null}
      onSelect={() => {}}
      emptyTitle={g.empty.title}
      emptyBody={g.empty.body}
      observationsLabel={g.observations}
      relationsLabel={g.relations}
      {...over}
    />,
  );
}

describe("BrowseList", () => {
  // The bug this catches: reading `entityType` off a summary row. It compiles
  // (the field is optional on a conflated type) and renders an empty badge on
  // every single row.
  it("renders the summary projection's `type` as the badge", () => {
    const html = browse();
    expect(html).toContain("ledger");
    expect(html).toContain("system");
    expect(html).toContain("note");
  });

  it("shows the first observation and both counts", () => {
    const html = browse();
    expect(html).toContain("written in Rust");
    expect(html).toContain(`3 ${g.observations}`);
    expect(html).toContain(`1 ${g.relations}`);
  });

  it("omits the preview line for an entity with no observations", () => {
    const html = browse({ graph: { ...summary, entities: [summary.entities[1]] } });
    expect(html).toContain("empty-one");
    expect(html).not.toContain("written in Rust");
  });

  // Every graph in every environment starts empty, so this is the state a member
  // sees first — it has to explain itself rather than look broken.
  it("explains itself when the graph is empty", () => {
    const html = browse({ graph: { entities: [], relations: [], totalObservations: 0 } });
    expect(html).toContain(g.empty.title);
    expect(html).toContain(g.empty.body);
  });

  it("marks the selected row as expanded", () => {
    expect(browse({ selected: "ledger" })).toContain('aria-expanded="true"');
    expect(browse()).not.toContain('aria-expanded="true"');
  });
});

describe("SearchList", () => {
  const hit: Entity = {
    name: "ledger",
    entityType: "system",
    observations: [{ content: "written in Rust", timestamp: 1_700_000_000_000, confidence: 1 }],
  };

  // Search returns FULL entities, so here it really is `entityType`. The two lists
  // read different fields on purpose; asserting both is what stops a "unify these"
  // refactor from blanking one.
  it("renders the full projection's `entityType`", () => {
    const html = renderToStaticMarkup(
      <SearchList
        hits={{ entities: [hit], relations: [] }}
        selected={null}
        onSelect={() => {}}
        noResults={g.noResults}
      />,
    );
    expect(html).toContain("ledger");
    expect(html).toContain("system");
    expect(html).toContain("written in Rust");
  });

  it("says so when nothing matched", () => {
    const html = renderToStaticMarkup(
      <SearchList
        hits={{ entities: [], relations: [] }}
        selected={null}
        onSelect={() => {}}
        noResults={g.noResults}
      />,
    );
    expect(html).toContain(g.noResults);
  });
});

describe("EntityDetail", () => {
  const base: Entity = {
    name: "ledger",
    entityType: "system",
    observations: [
      { content: "written in Rust", timestamp: 1_700_000_000_000, confidence: 0.9 },
      // No confidence at all — the Go field is omitempty, so this is absent rather
      // than zero, and it must NOT render as "0%".
      { content: "deployed weekly", timestamp: 1_700_000_100_000 },
    ],
  };

  function detail(entity: Entity = base, rels: Relation[] = relations) {
    return renderToStaticMarkup(
      <EntityDetail
        entity={entity}
        relations={rels}
        formatWhen={(ms) => (ms ? `at:${ms}` : "")}
        copy={g}
        height={320}
        onResizeStart={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it("renders every observation with its timestamp", () => {
    const html = detail();
    expect(html).toContain("written in Rust");
    expect(html).toContain("deployed weekly");
    expect(html).toContain("at:1700000000000");
  });

  // The reference control is gated on `onReference` being supplied, and that prop travels four
  // components — ChatView → UploadsSidebar → MemoryGraphPanel → here. Any link dropping it makes
  // the feature silently not exist, with nothing failing. These two assertions are what notice.
  it("offers no reference control when there is no chat to reference into", () => {
    expect(detail()).not.toContain(g.referenceEntity);
  });

  it("offers the reference control when the chat supplied a slot", () => {
    const html = renderToStaticMarkup(
      <EntityDetail
        entity={base}
        relations={relations}
        formatWhen={() => ""}
        copy={g}
        height={320}
        onResizeStart={() => {}}
        onClose={() => {}}
        onReference={() => {}}
      />,
    );
    expect(html).toContain(g.referenceEntity);
  });


  it("shows a confidence only when the record carries one", () => {
    const html = detail();
    expect(html).toContain("90%");
    // Counted, not searched for: "90%" itself contains "0%", so a naive absence
    // check passes no matter what. Exactly ONE observation carries a confidence, so
    // the label must appear exactly once.
    const labels = html.split(g.confidence).length - 1;
    expect(labels).toBe(1);
  });

  it("renders the entity's relations in both directions", () => {
    const html = detail();
    expect(html).toContain("maintains");
    expect(html).toContain("reviews for");
  });

  it("says when there are no observations yet", () => {
    const html = detail({ ...base, observations: [] });
    expect(html).toContain(g.noObservations);
  });

  // Archived and merged entities are reachable BY NAME even though the browse list
  // hides them, so the pane has to say which one you are looking at — otherwise a
  // member reads a retired fact as current.
  it("labels an archived entity", () => {
    expect(text(detail({ ...base, archived: true }))).toContain(g.archived);
    expect(text(detail())).not.toContain(g.archived);
  });

  it("labels a merged entity and names its target", () => {
    const html = detail({ ...base, merged: true, mergedInto: "canonical-ledger" });
    expect(html).toContain(g.mergedInto);
    expect(html).toContain("canonical-ledger");
  });

  it("omits the relations section when there are none", () => {
    const html = detail(base, []);
    expect(html).not.toContain("maintains");
  });
});

describe("RecentList", () => {
  const recent: RecentChanges = {
    recentEntities: [{ name: "fresh", entityType: "note", observations: [] }],
    recentRelations: [{ from: "fresh", to: "ledger", relationType: "mentions" }],
    recentObservations: [
      {
        entity: "ledger",
        observations: [{ content: "learned today", timestamp: 1_700_000_200_000 }],
      },
    ],
  };

  function render(over: Partial<RecentChanges> = {}) {
    return renderToStaticMarkup(
      <RecentList
        recent={{ ...recent, ...over }}
        onSelect={() => {}}
        formatWhen={(ms) => (ms ? `at:${ms}` : "")}
        copy={g.recentCopy}
      />,
    );
  }

  it("groups new observations, entities and relations", () => {
    const html = render();
    expect(html).toContain(g.recentCopy.learned);
    expect(html).toContain("learned today");
    expect(html).toContain(g.recentCopy.newEntities);
    expect(html).toContain("fresh");
    expect(html).toContain(g.recentCopy.newRelations);
    expect(html).toContain("mentions");
  });

  it("hides a group that has nothing in it", () => {
    const html = render({ recentRelations: [] });
    expect(html).not.toContain(g.recentCopy.newRelations);
  });

  it("says so when nothing changed", () => {
    const html = render({ recentEntities: [], recentRelations: [], recentObservations: [] });
    expect(html).toContain(g.recentCopy.nothing);
  });
});

describe("EntityDetail provenance", () => {
  const withSources: Entity = {
    name: "ledger",
    entityType: "system",
    createdAt: 100,
    sourceSessionId: "conv-created",
    observations: [
      { content: "written in Rust", timestamp: 500, sourceSessionId: "conv-recent" },
      { content: "no known origin", timestamp: 400 },
    ],
  };

  // Only the SOURCES section, so the count is not perturbed by the pane's own chrome
  // (the close control) — which is what broke these the first time the header grew a
  // button.
  function sourcesSection(html: string): string {
    const start = html.indexOf(g.sources);
    if (start < 0) return "";
    const end = html.indexOf("<h4", start + 1);
    return html.slice(start, end < 0 ? undefined : end);
  }

  function detail(entity: Entity, titleFor?: (id: string) => string | null) {
    return renderToStaticMarkup(
      <EntityDetail
        entity={entity}
        relations={[]}
        formatWhen={(ms) => (ms ? `at:${ms}` : "")}
        copy={g}
        conversationTitle={titleFor}
        onOpenConversation={() => {}}
        height={320}
        onResizeStart={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it("lists each source conversation by title, newest first", () => {
    const html = detail(withSources, (id) =>
      id === "conv-recent" ? "Rust migration" : id === "conv-created" ? "First chat" : null,
    );
    expect(html).toContain(g.sources);
    expect(html).toContain("Rust migration");
    expect(html).toContain("First chat");
    expect(html.indexOf("Rust migration")).toBeLessThan(html.indexOf("First chat"));
  });

  // Absent provenance is legitimate — a cron job, the heartbeat, concurrent chats, or
  // anything stored before the field existed. It must read as an explanation, not a
  // failure.
  it("explains an entity with no recorded source instead of showing an empty box", () => {
    const html = detail({ name: "x", entityType: "t", observations: [{ content: "a", timestamp: 1 }] });
    expect(html).toContain(g.noSources);
    expect(html).not.toContain(g.sourcesHint);
  });

  // A conversation can be deleted from the webapp's store while the graph keeps its
  // id. That must render as unavailable, never as a button that navigates nowhere.
  it("renders a deleted conversation as unavailable, not as a link", () => {
    const html = detail(withSources, () => null);
    expect(html).toContain(g.goneConversation);
    // The two sources exist but neither is clickable, so no SOURCE row is a button.
    const buttons = sourcesSection(html).match(/<button/g) ?? [];
    expect(buttons.length).toBe(0);
  });

  it("does not invent a source for an unattributed observation", () => {
    const html = detail(withSources, (id) => (id === "conv-recent" ? "Rust migration" : null));
    // conv-created has no title here, so exactly one SOURCE row is a link and one is not.
    expect((sourcesSection(html).match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain(g.goneConversation);
  });
});

// --- walking the graph: relation endpoints are links ---
//
// Organising by theme (a "tema" entity related to its members) is only useful if
// opening the theme lets you jump to what it contains. Both endpoints were plain text
// before, which made the relation list a dead end.
describe("RelationLine", () => {
  const rel: Relation = { from: "Onboarding", to: "Checklist", relationType: "inclui" };

  it("renders both endpoints as links when navigation is offered", () => {
    const html = renderToStaticMarkup(<RelationLine relation={rel} onOpen={() => {}} />);
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html).toContain("Onboarding");
    expect(html).toContain("Checklist");
    expect(html).toContain("inclui");
  });

  // Clicking the entity you are already viewing is a no-op that still looks clickable.
  it("leaves the current entity as plain text", () => {
    const html = renderToStaticMarkup(
      <RelationLine relation={rel} current="Onboarding" onOpen={() => {}} />,
    );
    expect((html.match(/<button/g) ?? []).length).toBe(1);
  });

  it("renders nothing clickable when no handler is given", () => {
    const html = renderToStaticMarkup(<RelationLine relation={rel} />);
    expect(html).not.toContain("<button");
  });
});

// --- organising by entityType ---
describe("BrowseList type filter", () => {
  const mixed: SummaryGraph = {
    entities: [
      { name: "Onboarding", type: "tema", observationCount: 1, relationCount: 2 },
      { name: "Samuel", type: "pessoa", observationCount: 3, relationCount: 1 },
      { name: "Ana", type: "pessoa", observationCount: 1, relationCount: 0 },
    ],
    relations: [],
    totalObservations: 5,
  };

  function withFilter(typeFilter: string | null) {
    return renderToStaticMarkup(
      <BrowseList
        graph={mixed}
        selected={null}
        onSelect={() => {}}
        emptyTitle={g.empty.title}
        emptyBody={g.empty.body}
        observationsLabel={g.observations}
        relationsLabel={g.relations}
        typeFilter={typeFilter}
        onTypeFilter={() => {}}
        allLabel={g.allTypes}
        noneOfTypeLabel={g.noneOfType}
      />,
    );
  }

  it("offers a chip per type plus an all-types chip, ordered by frequency", () => {
    const html = withFilter(null);
    expect(html).toContain(g.allTypes);
    expect(html.indexOf("pessoa")).toBeLessThan(html.indexOf("tema"));
    expect(html).toContain("Onboarding");
    expect(html).toContain("Samuel");
  });

  it("shows only the chosen type", () => {
    const html = withFilter("tema");
    expect(html).toContain("Onboarding");
    expect(html).not.toContain("Samuel");
    expect(html).not.toContain("Ana");
  });

  // A single type makes the chip row a control that can only say what the list already
  // says, so it is not rendered at all.
  it("hides the chip row when every entity shares one type", () => {
    const html = renderToStaticMarkup(
      <BrowseList
        graph={{ ...mixed, entities: [mixed.entities[1], mixed.entities[2]] }}
        selected={null}
        onSelect={() => {}}
        emptyTitle={g.empty.title}
        emptyBody={g.empty.body}
        observationsLabel={g.observations}
        relationsLabel={g.relations}
        typeFilter={null}
        onTypeFilter={() => {}}
        allLabel={g.allTypes}
        noneOfTypeLabel={g.noneOfType}
      />,
    );
    expect(html).not.toContain(g.allTypes);
  });

  it("says so when a filter matches nothing", () => {
    expect(withFilter("sistema")).toContain(g.noneOfType);
  });

  // Without a handler the list is the plain, unfiltered thing every other caller gets.
  it("renders no chips when filtering is not offered", () => {
    const html = renderToStaticMarkup(
      <BrowseList
        graph={mixed}
        selected={null}
        onSelect={() => {}}
        emptyTitle={g.empty.title}
        emptyBody={g.empty.body}
        observationsLabel={g.observations}
        relationsLabel={g.relations}
      />,
    );
    expect(html).not.toContain(g.allTypes);
    expect(html).toContain("Samuel");
  });
});

// --- the detail pane's own chrome ---
//
// It opens UNDER the list it was reached from, so it needs to be dismissible, resizable
// and visually distinct. Without a close control the only way out was to click the same
// row again — discoverable only by accident.
describe("EntityDetail chrome", () => {
  const e: Entity = {
    name: "ledger",
    entityType: "system",
    observations: [{ content: "written in Rust", timestamp: 1 }],
  };

  function chrome(height = 320) {
    return renderToStaticMarkup(
      <EntityDetail
        entity={e}
        relations={[]}
        formatWhen={() => ""}
        copy={g}
        height={height}
        onResizeStart={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it("offers a close control", () => {
    expect(chrome()).toContain(g.closeDetail);
  });

  it("offers a resize handle", () => {
    const html = chrome();
    expect(html).toContain(g.resizeDetail);
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain("cursor-row-resize");
  });

  it("takes its height from the prop rather than a fixed fraction", () => {
    expect(chrome(500)).toContain("height:500px");
    expect(chrome(180)).toContain("height:180px");
  });

  // It used to share the list's `bg-elevated` and a hairline border, which is exactly
  // the complaint: the open pane read as more list. A thicker accent edge, a distinct
  // surface and a shadow separate them.
  it("stands out from the list behind it", () => {
    const html = chrome();
    expect(html).toContain("border-accent/60");
    expect(html).toContain("shadow-");
    expect(html).not.toContain("bg-elevated");
  });
});
