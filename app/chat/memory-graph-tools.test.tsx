import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapTools, {
  MapToolsButton,
  toggleRelationType,
  type ToolGroup,
} from "./memory-graph-tools";
import MemoryGraphView from "./memory-graph-view";
import { MAP_TOOLS_DEFAULTS } from "./use-map-tools";
import { chatCopy } from "@/lib/i18n/chat";
import type { SummaryEntity } from "@/lib/memoryGraph";

const g = chatCopy.en.memoryGraph;

// `null` means every relation type and `[]` means none. They are both reachable and they mean
// opposite things, so the transitions between them are the part worth pinning — a facet that
// silently turned "none" into "all" would look like the control did nothing.
describe("toggleRelationType", () => {
  it("narrows from 'all' to just the type that was picked", () => {
    // Starting at null, the member's intent in clicking one chip is to see that one — not to
    // subtract it from everything, which would look like nothing happened on a two-type graph.
    expect(toggleRelationType(null, "maintains")).toEqual(["maintains"]);
  });

  it("adds a second type rather than replacing the first", () => {
    expect(toggleRelationType(["maintains"], "reviews")).toEqual(["maintains", "reviews"]);
  });

  it("removes a type that was already on", () => {
    expect(toggleRelationType(["maintains", "reviews"], "maintains")).toEqual(["reviews"]);
  });

  it("allows emptying the list, because 'no relations' is a legitimate view", () => {
    // Entities without their connections is a real thing to want to look at, and it is what
    // GD-A3 promises stays drawable.
    expect(toggleRelationType(["maintains"], "maintains")).toEqual([]);
  });
});

describe("MapTools", () => {
  const base = {
    tools: MAP_TOOLS_DEFAULTS,
    set: () => {},
    relationTypeDomain: [
      { type: "maintains", count: 3 },
      { type: "reviews", count: 1 },
    ],
    maxObservations: 12,
    legendDomain: [{ type: "person", count: 2 }],
    renderedCounts: new Map([["person", 2]]),
    typeFilter: null,
    onTypeFilter: () => {},
    colorFor: () => "#000000",
    insightRows: [
      { name: "hub", value: "9", onMap: true },
      { name: "far away", value: "7", onMap: false },
    ],
    isolatedCount: 2,
    onSelectEntity: () => {},
    pathMode: false,
    onPathModeChange: () => {},
    pathFrom: null,
    pathResult: null,
    onPathClear: () => {},
    dirty: false,
    onReset: () => {},
    onClose: () => {},
    openGroups: [] as ToolGroup[],
    onToggleGroup: () => {},
    copy: g,
  };

  it("shows every group's header with no group open, so the panel reads as a menu", () => {
    // All closed on arrival. Six expanded groups is a wall of controls; closed, the member sees
    // the six things the panel can do and opens the one they came for.
    const html = renderToStaticMarkup(<MapTools {...base} />);
    for (const title of [
      g.mapTools.filters,
      g.mapTools.focus,
      g.mapTools.encoding,
      g.mapTools.legend,
      g.mapTools.path,
      g.mapTools.insights,
    ]) {
      expect(html, title).toContain(title);
    }
    // Headers only: no group's CONTENTS are in the document.
    expect(html).not.toContain(g.mapTools.relationTypes);
    expect(html).not.toContain(g.mapTools.sizeBy);
    expect(html).not.toContain(g.mapTools.insightsScope);
    expect(html).toContain('aria-expanded="false"');
  });

  it("opens only the group asked for", () => {
    const html = renderToStaticMarkup(<MapTools {...base} openGroups={["filters"]} />);
    expect(html).toContain(g.mapTools.relationTypes);
    expect(html, "encoding was not asked for").not.toContain(g.mapTools.sizeBy);
  });

  // Independent, not an accordion: "colour by cluster" is in Encoding and "what the clusters are"
  // is in Legend, so a member comparing them needs both at once.
  it("keeps several groups open at the same time", () => {
    const html = renderToStaticMarkup(
      <MapTools {...base} openGroups={["encoding", "legend"]} />,
    );
    expect(html).toContain(g.mapTools.sizeBy);
    expect(html).toContain(g.mapTools.colorBy);
    expect(html).toContain("person");
    expect(html, "filters was not among them").not.toContain(g.mapTools.relationTypes);
  });

  it("offers every relation type the graph has", () => {
    const html = renderToStaticMarkup(<MapTools {...base} openGroups={["filters"]} />);
    expect(html).toContain("maintains");
    expect(html).toContain("reviews");
  });

  it("says so when the agent has recorded no relations at all", () => {
    const html = renderToStaticMarkup(
      <MapTools {...base} relationTypeDomain={[]} openGroups={["filters"]} />,
    );
    expect(html).toContain(g.mapTools.noRelationTypes);
  });

  it("warns when every relation type has been switched off", () => {
    const html = renderToStaticMarkup(
      <MapTools
        {...base}
        tools={{ ...MAP_TOOLS_DEFAULTS, relationTypes: [] }}
        openGroups={["filters"]}
      />,
    );
    expect(html).toContain(g.mapTools.relationTypesNone);
  });

  it("marks the current focus radius, so the control is not three identical numbers", () => {
    const html = renderToStaticMarkup(
      <MapTools {...base} tools={{ ...MAP_TOOLS_DEFAULTS, hopRadius: 3 }} openGroups={["focus"]} />,
    );
    expect(html).toContain('aria-pressed="true"');
  });

  it("hides the observation floor on a graph where it could do nothing", () => {
    // Every entity at zero observations means the slider has a single position. Showing a
    // control that cannot change anything is worse than not showing it.
    const html = renderToStaticMarkup(
      <MapTools {...base} maxObservations={0} openGroups={["filters"]} />,
    );
    expect(html).not.toContain(g.mapTools.minObservationsAny);
  });

  // The reset reaches past this panel — it clears the entity-type filter, which is SHARED with the
  // Entities tab. So it is offered only when it can actually change something, and it says what it
  // will do rather than just being an icon.
  it("disables the reset when everything is already at its default", () => {
    const html = renderToStaticMarkup(<MapTools {...base} dirty={false} />);
    expect(html).toContain(g.mapTools.resetNothing);
    expect(html).toContain("disabled");
  });

  it("enables the reset, and explains its reach, once something is off default", () => {
    const html = renderToStaticMarkup(<MapTools {...base} dirty />);
    expect(html).toContain(g.mapTools.resetHint);
    expect(html, "the hint must name the shared Entities-tab filter").toContain("Entities tab");
  });
});

// Separate from the panel because the panel is a sidebar and this is an overlay on the stage — two
// placements, so two components rather than one that has to know which it is.
describe("MapToolsButton", () => {
  it("is labelled, not just an icon", () => {
    const html = renderToStaticMarkup(<MapToolsButton onOpen={() => {}} copy={g} />);
    expect(html).toContain(g.mapTools.open);
  });

  it("carries none of the panel's contents", () => {
    const html = renderToStaticMarkup(<MapToolsButton onOpen={() => {}} copy={g} />);
    expect(html).not.toContain(g.mapTools.legend);
    expect(html).not.toContain(g.mapTools.resetHint);
  });
});

// A filter that hides everything must not hide the thing that can undo it. The map's no-match
// branch used to return a bare empty state, which would strand a member with no reachable
// control — the same dead end the legend's stable domain exists to prevent, one level up.
//
// Effects never fire under `environment: "node"`, so Cytoscape never initialises and the view
// renders as markup. That is exactly the part being asserted.
describe("MemoryGraphView — the tools survive a filter that matched nothing", () => {
  const entity = (name: string): SummaryEntity => ({
    name,
    type: "person",
    observationCount: 2,
    relationCount: 0,
  });

  const view = (
    entities: SummaryEntity[],
    query: string,
    matchNames: Set<string> | null = null,
  ) =>
    renderToStaticMarkup(
      <MemoryGraphView
        entities={entities}
        relations={[]}
        typeFilter={null}
        onTypeFilter={() => {}}
        onResetFilters={() => {}}
        query={query}
        matchNames={matchNames}
        filter={{
          value: "",
          onChange: () => {},
          searching: false,
          failed: false,
          capped: false,
          cap: 300,
        }}
        selected={null}
        onSelect={() => {}}
        tools={MAP_TOOLS_DEFAULTS}
        setTool={() => {}}
        copy={g}
      />,
    );

  it("keeps the tools button on screen when nothing matches", () => {
    const html = view([entity("alice")], "no such entity");
    expect(html).toContain(g.mapNoMatch);
    expect(html, "the only control that can clear the filter must still be there").toContain(
      g.mapTools.open,
    );
  });

  it("offers no tools on a graph the agent has not written to yet", () => {
    // Nothing to filter, so a filter panel would be an empty promise.
    const html = view([], "");
    expect(html).toContain(g.empty.title);
    expect(html).not.toContain(g.mapTools.open);
  });

  // NOTE on what is NOT tested here: the legend's own contents. The disclosure is collapsed by
  // default in the sidebar column (open only in fullscreen), so rendering the view never emits it
  // and there is no prop to force it. The legend's domain — including the "unknown" row for
  // untyped entities, which GD-A1 needs — is covered directly in `lib/memoryGraph.test.ts` under
  // `legendTypeCounts`, and its rendering in `memory-graph-readouts.test.tsx`.

  // GD-D5. The names-only hint ("the map filter matches names only") is actively misleading
  // after a CONTENT search: it sends the member hunting for a spelling mistake when what they
  // actually learned is that no observation mentions the term.
  it("says the right thing about which filter matched nothing", () => {
    const local = view([entity("alice")], "nope");
    expect(local).toContain(g.mapNoMatchHint);
    expect(local).not.toContain(g.mapNoMatchContentsHint);

    const server = view([entity("alice")], "nope", new Set());
    expect(server).toContain(g.mapNoMatchContents);
    expect(server).toContain(g.mapNoMatchContentsHint);
  });
});
