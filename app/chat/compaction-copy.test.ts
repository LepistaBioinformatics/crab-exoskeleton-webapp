import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { chatCopy } from "@/lib/i18n/chat";

// Asserted against the SOURCE, like `pane-weight.test.ts` and the file-preview
// suite: CompactionRow only renders inside a mounted transcript with a history
// response behind it, and what is being pinned here is which strings reach a
// screen at all -- a question the markup answers and a render would obscure.
const src = readFileSync(new URL("./chat-view.tsx", import.meta.url), "utf8");
const row = src.slice(src.indexOf("function CompactionRow"), src.indexOf("function StepRun"));

describe("the compaction divider", () => {
  // THE LEAK THIS CLOSES. The harness's own note reads "[2 earlier messages are
  // not in this window; the full transcript is preserved]" -- brackets, "window",
  // "transcript" -- and it was rendered verbatim under the divider. It is `Count`
  // formatted into a sentence (marker_test.go asserts they agree), so it carries
  // nothing the count does not, in the one register the member cannot read.
  it("does not put the harness's raw note on the screen", () => {
    // The FIELD ACCESS, not the word: `<details>` carries it as a substring.
    expect(row).not.toMatch(/\.detail\b/);
  });

  // THE AFFORDANCE IS IN THE TEXT. A summary on its own line under the rule was
  // a second thing to read for one status; the divider itself toggles, with the
  // chevron beside the words rather than below them.
  it("makes the divider line the button", () => {
    const summary = row.slice(row.indexOf("<summary"), row.indexOf("</summary>"));
    expect(summary).toContain("{label}");
    expect(summary).toContain("ChevronRight");
    expect(summary).toContain("cursor-pointer");
    // Hover says what the click gives, which the words themselves do not.
    expect(summary).toContain("title={t.view.compactedWhat}");
  });

  // Every word of the mechanism is behind the click, and none of it leaks back
  // out onto the line -- which is how the divider becomes a paragraph again.
  it("keeps the whole explanation behind the click", () => {
    const fold = row.indexOf("</summary>");
    for (const key of ["compactedWhyLimit", "compactedWhySaves", "compactedWhyKept"]) {
      expect(row.slice(fold)).toContain(`t.view.${key}`);
      expect(row.slice(0, fold)).not.toContain(`t.view.${key}`);
    }
  });

  // Keyboard operation and the expanded/collapsed announcement come from the
  // element, not from a hook. A div with an onClick would look identical and be
  // unreachable without a mouse.
  it("stays a native details/summary", () => {
    expect(row).toContain("<details className=\"group\">");
    expect(row).toContain("<summary");
  });
});

describe("the copy", () => {
  // It reads as an optimisation in both locales, which is the whole point of the
  // rewrite: the first cut said what LEFT, over a conversation still fully on
  // screen.
  it("leads with what was gained, in every locale", () => {
    for (const [locale, t] of Object.entries(chatCopy)) {
      for (const line of [t.view.compactedOne, t.view.compactedOther, t.view.compactedSome]) {
        expect(line.toLowerCase(), `${locale}: ${line}`).toMatch(/token/);
      }
    }
  });

  // NO INVENTED NUMBER. The record holds how many MESSAGES were set aside and not
  // how many tokens that saved; a token figure in this sentence would be the only
  // unverifiable thing on the screen.
  it("claims no token count it cannot know", () => {
    for (const t of Object.values(chatCopy)) {
      expect(t.view.compactedOther.match(/\{n\}/g) ?? []).toHaveLength(1);
      expect(t.view.compactedSome).not.toMatch(/\d/);
    }
  });

  // The reassurance survives the move into the disclosure. Without it the row
  // tells a member their history was shortened and stops there.
  it("still says nothing was lost", () => {
    expect(chatCopy.en.view.compactedWhyKept.toLowerCase()).toContain("nothing was deleted");
    expect(chatCopy.pt.view.compactedWhyKept.toLowerCase()).toContain("nada foi apagado");
  });
});
