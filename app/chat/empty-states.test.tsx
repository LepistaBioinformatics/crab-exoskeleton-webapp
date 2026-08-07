import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { BrowseList, RecentList, SearchList } from "./memory-graph-views";
import MemoryGraphView from "./memory-graph-view";
import { chatCopy } from "@/lib/i18n/chat";
import type { RecentChanges, SummaryGraph } from "@/lib/memoryGraph";

// Every "nothing to show" branch goes through components/ui/panel-empty.tsx.
//
// This is the mechanical half of that guarantee: each branch below has to emit the
// component's `data-empty-state` marker, so reverting one to hand-rolled markup — the
// way all of them were written originally, which is how they drifted into three
// alignments and three type scales — fails here rather than in review.
//
// It cannot be the WHOLE guarantee. The suite runs `environment: "node"`, so effects
// never fire and no test can observe a member's view of these panes. Anything reached
// only through a fetch is deliberately absent below and is verified by looking at the
// running app instead:
//
//   - Files: uploads-sidebar.tsx, both the empty and the filtered branch
//   - Scheduled tasks: the "none" and "all finished" branches
//   - Agent secrets: secrets-drawer.tsx
//   - Knowledge graph › Search before a query: memory-graph-panel.tsx
//   - Conversations and Workspaces in the left sidebar
//
// Listing them is the point: a test that silently skipped them would read as coverage.

const g = chatCopy.en.memoryGraph;

const MARKER = "data-empty-state";

function markers(html: string): number {
  return html.split(MARKER).length - 1;
}

const emptyGraph: SummaryGraph = {
  entities: [],
  relations: [],
  totalObservations: 0,
};

const populated: SummaryGraph = {
  entities: [
    { name: "ledger", type: "system", observationCount: 1, relationCount: 0 },
  ],
  relations: [],
  totalObservations: 1,
};

const noRecent: RecentChanges = {
  recentEntities: [],
  recentRelations: [],
  recentObservations: [],
};

function browse(graph: SummaryGraph, typeFilter: string | null = null) {
  return renderToStaticMarkup(
    <BrowseList
      graph={graph}
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
      noneOfTypeHint={g.noneOfTypeHint}
    />,
  );
}

function map(graph: SummaryGraph, query = "") {
  return renderToStaticMarkup(
    <MemoryGraphView
      entities={graph.entities}
      relations={graph.relations}
      typeFilter={null}
      query={query}
      selected={null}
      onSelect={() => {}}
      emptyTitle={g.empty.title}
      emptyLabel={g.empty.body}
      expandLabel={g.expandMap}
      collapseLabel={g.collapseMap}
      spreadOutLabel={g.spreadOut}
      spreadInLabel={g.spreadIn}
      fitLabel={g.fitMap}
      spreadReadout={g.spreadReadout}
      noMatchLabel={g.mapNoMatch}
      noMatchHint={g.mapNoMatchHint}
      truncatedLabel={g.mapTruncated}
    />,
  );
}

describe("the knowledge graph's empty branches all render one component", () => {
  it("Entities, on a graph the agent has not written to yet", () => {
    const html = browse(emptyGraph);
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.empty.title);
    expect(html).toContain(g.empty.body);
  });

  it("Entities, with a type filter that matches nothing", () => {
    const html = browse(populated, "note");
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.noneOfType);
    expect(html).toContain(g.noneOfTypeHint);
  });

  // The hint names the All chip. `populated` holds ONE type, so the chip row's
  // `types.length > 1` condition is false — and with the filter set to something else,
  // hiding the row would leave a member reading "Choose All above" with no All above
  // and no way out of a filter that survives every re-fetch. The agent archiving or
  // merging entities between visits is exactly how a graph arrives in this shape.
  it("keeps the All chip reachable whenever a filter is what emptied the list", () => {
    // The CHIP, not the word: the hint itself contains "All", so a bare
    // `toContain(g.allTypes)` passes whether or not the control is on screen. The chip
    // renders its label beside the total, which the sentence never does.
    expect(browse(populated, "note")).toContain(
      `>${g.allTypes} ${populated.entities.length}<`,
    );
  });

  it("Search, with no hits", () => {
    const html = renderToStaticMarkup(
      <SearchList
        hits={{ entities: [], relations: [] }}
        selected={null}
        onSelect={() => {}}
        noResults={g.noResults}
        noResultsHint={g.noResultsHint}
      />,
    );
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.noResults);
    expect(html).toContain(g.noResultsHint);
  });

  it("Recent, with nothing in the last 24h", () => {
    const html = renderToStaticMarkup(
      <RecentList
        recent={noRecent}
        onSelect={() => {}}
        formatWhen={() => ""}
        copy={g.recentCopy}
      />,
    );
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.recentCopy.nothing);
    expect(html).toContain(g.recentCopy.nothingHint);
  });

  it("Map, on an empty graph", () => {
    const html = map(emptyGraph);
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.empty.title);
  });

  // The distinction NG1 exists to protect: an empty graph and a filter that hid
  // everything are different facts, and the fix for each is different. If these two
  // ever say the same thing, one of them is lying about the workspace.
  it("Map, with a name filter that matches nothing", () => {
    const html = map(populated, "zzz-no-such-entity");
    expect(markers(html)).toBe(1);
    expect(html).toContain(g.mapNoMatch);
    expect(html).toContain(g.mapNoMatchHint);
    expect(html).not.toContain(g.empty.title);
  });
});
