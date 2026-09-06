import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import RightRail from "./right-rail";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

// right-rail-discoverability. The whole feature is "the controls are simply visible",
// so what a test can hold onto is the contract of that visibility: five named
// controls, one marked when its pane is open, and a group a screen reader can
// announce as one thing.
describe("RightRail", () => {
  it("offers one named control per section, in order", () => {
    const html = renderToStaticMarkup(<RightRail open={null} onSelect={() => {}} />);
    for (const label of [
      en.memory.title,
      en.memoryGraph.title,
      en.scheduledTasks.title,
      en.uploads.files,
      en.secrets.title,
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
      // `title` as well: with no label beside the icon, the tooltip is the only
      // thing a sighted member can read (DEC-2 accepted that cost).
      expect(html).toContain(`title="${label}"`);
    }
    const order = [
      en.memory.title,
      en.memoryGraph.title,
      en.scheduledTasks.title,
      en.uploads.files,
      en.secrets.title,
    ].map((l) => html.indexOf(`aria-label="${l}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // A NAMED group, so a screen reader announces entering "Workspace" rather than
  // reading five unrelated buttons at the edge of the page. Deliberately not
  // `role="toolbar"`: that promises arrow-key navigation with one tab stop, which
  // five plain buttons do not give.
  it("is one named group, not five loose buttons", () => {
    const html = renderToStaticMarkup(<RightRail open={null} onSelect={() => {}} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Workspace"');
    expect(html).not.toContain('role="toolbar"');
  });

  it("marks the section whose pane is open, and only it", () => {
    const html = renderToStaticMarkup(<RightRail open="files" onSelect={() => {}} />);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    const current = html.indexOf('aria-current="true"');
    // The marked one is the files entry: its aria-label opens the same tag.
    const tagStart = html.lastIndexOf("<button", current);
    expect(html.slice(tagStart, current)).toContain(`aria-label="${en.uploads.files}"`);
  });

  it("marks nothing while the sidebar is closed", () => {
    const html = renderToStaticMarkup(<RightRail open={null} onSelect={() => {}} />);
    expect(html).not.toContain('aria-current="true"');
  });

  // FR-1.6: below `md` the expander in the header takes over, and a rail on a phone
  // would eat a tenth of the width.
  it("is desktop-only", () => {
    const html = renderToStaticMarkup(<RightRail open={null} onSelect={() => {}} />);
    expect(html).toMatch(/class="[^"]*hidden md:flex/);
  });
})
