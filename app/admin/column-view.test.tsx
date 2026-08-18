import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import ColumnView from "./column-view";
import type { Column } from "./columns";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en;

function render(column: Column) {
  return renderToStaticMarkup(<ColumnView column={column} onSelect={() => {}} />);
}

const agents: Column = {
  key: "agents",
  rows: [
    { id: "agent:alpha", text: "alpha", branch: true, selected: true, tone: "normal", icon: "agent" },
    { id: "agent:beta", text: "beta", branch: true, selected: false, tone: "normal", icon: "agent" },
    {
      id: "agent:__all__",
      textKey: "legacy",
      hintKey: "legacy",
      branch: true,
      selected: false,
      tone: "legacy",
      icon: "legacy",
    },
  ],
};

describe("ColumnView", () => {
  it("names the question the column answers", () => {
    expect(render(agents)).toContain(t.columns.headings.agents);
  });

  it("marks the selected row for assistive technology", () => {
    expect(render(agents)).toContain('aria-current="true"');
  });

  // The chevron is decoration and is hidden, so the affordance has to live in state a
  // screen reader can read.
  it("puts the branch affordance in aria-expanded, not only in the glyph", () => {
    const html = render(agents);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("gives leaves no aria-expanded at all", () => {
    const sections: Column = {
      key: "sections",
      rows: [
        { id: "section:files", textKey: "files", branch: false, selected: true, tone: "normal", icon: "files" },
      ],
    };
    expect(render(sections)).not.toContain("aria-expanded");
  });

  // THE SIGNATURE. A column that is no longer the active one still shows what was chosen
  // in it, quieter — that is the difference between where you are and how you got here,
  // and not knowing what was selected is the bug this screen was rebuilt to fix.
  // The `trail` tone is gone with the strip that needed it: only the column whose question
  // is still open is drawn, and nothing in it is selected. A selection, if one is ever
  // handed to a drawn column, still has to be VISIBLE — `bg-accent/15` was tried once and
  // rendered indistinguishably from `bg-elevated` on a dark background.
  it("draws a selection with a fill a person can actually see", () => {
    expect(render(agents)).toContain("bg-accent font-semibold text-accent-fg");
  });

  it("keeps the legacy store subordinate and labelled by its copy", () => {
    const html = render(agents);
    expect(html).toContain("border-dashed");
    expect(html).toContain(t.legacyStore.entryLabel);
    expect(html).not.toContain("__all__>");
  });

  // A blank column is a worse answer than a stated one, and hiding the rows to show the
  // notice would take away the legacy store, which is still reachable.
  it("states an empty column's reason without dropping the rows it still has", () => {
    const html = render({ ...agents, rows: [agents.rows[2]], empty: "noAgents" });
    expect(html).toContain(t.columns.empty.noAgents);
    expect(html).toContain("data-empty-state");
    expect(html).toContain(t.legacyStore.entryLabel);
  });

  it("translates prose rows and leaves identifiers verbatim", () => {
    const root: Column = {
      key: "root",
      rows: [
        { id: "root:branding", textKey: "branding", branch: false, selected: false, tone: "normal", icon: "branding" },
        { id: "root:agents", textKey: "agents", branch: true, selected: false, tone: "normal", icon: "agents" },
      ],
    };
    const html = render(root);
    expect(html).toContain(t.shell.branding);
    expect(html).toContain(t.columns.rows.agents);
    expect(render(agents)).toContain("alpha");
  });
});
