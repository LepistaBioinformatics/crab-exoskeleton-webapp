import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// The panel's children reach for browser APIs (localStorage in the width effect,
// fetch in the media list). The suite runs `environment: "node"`, so no effect fires
// and none of that is touched — but the module graph is imported, so anything that
// runs at import time has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import UploadsSidebar from "./uploads-sidebar";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

// First paint only: which way the track is translated, and that BOTH panes are in the
// markup. The section state itself is internal, so what is asserted is the state the
// panel opens in — the menu — plus the contract that makes the slide animate at all.
function render() {
  return renderToStaticMarkup(
    <UploadsSidebar workspace={workspace} refreshSignal={0} onClose={() => {}} />,
  );
}

// The files pane's own chrome. Its absence is exactly what these did not catch the
// first time: the "New folder" button, the organise hint and the root drop zone were
// all written and NONE of them reached the file — a scripted edit matched a line
// prettier had already reformatted and failed silently, and every existing test still
// passed. Asserting the controls EXIST is the cheap guard against that whole class.
//
// Rendered with the files section already open: both PANES stay mounted through the
// slide, but the detail pane's CONTENT is conditional on which section was chosen, so
// at first paint on the menu there is nothing of the files pane to assert.
describe("files pane controls", () => {
  const filesPane = () =>
    renderToStaticMarkup(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        initialSection="files"
      />,
    );

  it("offers a create-folder control", () => {
    const html = filesPane();
    expect(
      html,
      "no New folder control in the markup — the whole point of the toolbar",
    ).toContain(t.uploads.newFolder);
  });

  it("warns that the agent references these paths", () => {
    expect(filesPane()).toContain(t.uploads.organiseHint);
  });

  // Dragging OUT of a folder needs somewhere to land; without this the only way back
  // to the root would be to re-upload.
  it("renders a root drop zone", () => {
    expect(filesPane()).toContain("min-h-8");
  });

  // The menu is still the default: nothing above should have changed that.
  it("still opens on the menu when no section is requested", () => {
    expect(render()).not.toContain(t.uploads.newFolder);
  });
});

function trackClasses(html: string): string {
  const m = /class="([^"]*w-\[200%\][^"]*)"/.exec(html);
  expect(m, "no track element in the markup").not.toBeNull();
  return m![1];
}

describe("UploadsSidebar track", () => {
  it("opens on the menu, with the track not yet slid", () => {
    const classes = trackClasses(render());
    expect(classes).toContain("translate-x-0");
    expect(classes).not.toContain("-translate-x-1/2");
  });

  // Unmounting the outgoing pane is how a slide animates to a blank column. The
  // detail pane must be present even before anything is selected.
  it("mounts both panes so the slide has something to land on", () => {
    const html = render();
    const slots = html.match(/class="[^"]*w-1\/2[^"]*"/g) ?? [];
    expect(slots.length).toBe(2);
  });

  it("lists the three workspace sections, each with its blurb", () => {
    const html = render();
    for (const label of [t.memory.title, t.memoryGraph.title, t.uploads.files]) {
      expect(html).toContain(label);
    }
    for (const blurb of [
      t.uploads.sections.memory,
      t.uploads.sections.graph,
      t.uploads.sections.files,
    ]) {
      expect(html).toContain(blurb);
    }
  });

  // Order is a product decision: memory and the graph answer "what does it know about
  // me", files are housekeeping. Asserted by position so a reshuffle is deliberate.
  it("orders the sections memory, graph, files", () => {
    const html = render();
    const at = (s: string) => html.indexOf(s);
    expect(at(t.memory.title)).toBeGreaterThan(-1);
    expect(at(t.memory.title)).toBeLessThan(at(t.memoryGraph.title));
    expect(at(t.memoryGraph.title)).toBeLessThan(at(t.uploads.files));
  });

  // The off-screen pane must leave the tab order, or a member tabbing forward from the
  // menu walks into controls they cannot see.
  it("takes the off-screen detail pane out of the tab order", () => {
    expect(render()).toContain("inert");
  });

  // The bug this exists for: a 200%-wide translated track does not stop existing when
  // it slides off the panel. Without `overflow-hidden` on an ancestor, the outgoing
  // pane kept painting on top of the chat — and every other test in this file passed
  // while it did, because they assert what is IN the markup, not what is clipped.
  it("renders the track inside a clipping viewport", () => {
    const html = render();
    const trackAt = html.indexOf("w-[200%]");
    expect(trackAt).toBeGreaterThan(-1);

    // Walk back TWO opening tags: the first is the track's own <div (whose class
    // attribute is where w-[200%] was found), the one before it is its parent.
    const before = html.slice(0, trackAt);
    const trackTag = before.lastIndexOf("<div");
    expect(trackTag).toBeGreaterThan(-1);
    const parentTag = before.lastIndexOf("<div", trackTag - 1);
    expect(parentTag).toBeGreaterThan(-1);
    const wrapper = before.slice(parentTag, trackTag);
    expect(
      wrapper,
      "the element wrapping the track does not clip it; the off-screen pane will paint over the chat",
    ).toContain("overflow-hidden");
  });

  it("keeps the resize separator, which is the only way back from a wide panel", () => {
    const html = render();
    expect(html).toContain('role="separator"');
    expect(html).toContain("cursor-col-resize");
  });
});
