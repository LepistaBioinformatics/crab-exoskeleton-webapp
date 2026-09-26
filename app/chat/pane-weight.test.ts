import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// THE SURVIVING HAIRLINES, named, so a nineteenth cannot be added by argument.
//
// `chat-shell-redesign` FR-6.0 counted 136 `border-brand/*` rules at six opacities and
// replaced them with a principle — "a hairline survives only where two surfaces of the
// same tone meet and the boundary carries meaning". "Carries meaning" is not checkable,
// so the sweep stopped where judgement ran out and eighteen horizontal rules were left.
//
// FR-1.0 makes it checkable: A HORIZONTAL RULE SURVIVES ONLY WHERE CONTENT SCROLLS PAST
// IT. A header pinned above a scroller, a status bar pinned below one — the rule is what
// says the region does not move with the content, and no amount of spacing says that.
//
// Asserted over SOURCE TEXT rather than by mounting, on the same grounds
// `resizable-pane.test.ts` records: two utilities of the same property on one element are
// invisible to tsc and to every behavioural test, and this is the same class of defect
// one level up — a rule nobody decided to add.

const ROOT = join(__dirname, "..", "..");

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/** Horizontal rules in real class strings — comments describing one do not count. */
function horizontalRules(text: string): number {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n")
    .match(/border-[tb] border-(rule|rule-strong|brand)/g)?.length ?? 0;
}

// THE EXCEPTIONS, each with the scroller it is pinned against. Everything else in
// `app/chat` is expected to draw none, which is what makes this a rule rather than a
// whitelist: a new component cannot add one and stay green, and raising a number here
// cannot be done without naming what a member scrolls past.
const PINNED: Record<string, { rules: number; why: string }> = {
  "unified-sidebar.tsx": { rules: 1, why: "the conversation list scrolls under the account footer" },
  "workspace-pane.tsx": { rules: 1, why: "the panel body scrolls under the pane header" },
  // THE SAME JUSTIFICATION AS THE LINE ABOVE, which is why this is the allowlist
  // working rather than being bent: the strip is pinned between the breadcrumb and the
  // centre, and the transcript scrolls UNDER it. The alternative -- separating it by
  // tone -- would put a third fill in a column that already carries the breadcrumb's
  // and the transcript's.
  "conversation-tab-strip.tsx": { rules: 1, why: "the centre pane scrolls under the strip" },
  // THREE, AND TWO OF THEM BREAK FR-1.0 ON PURPOSE. The first is the pinned
  // stack the task list scrolls under, which the rule allows. The other two are
  // SEPARATORS INSIDE A SCROLLING LIST -- exactly what this file exists to
  // forbid, and what turn-dock.tsx's entry distinguishes itself from.
  //
  // Overridden by the project owner, on a report the principle's premise does
  // not survive: "não dá pra saber onde começa uma e termina outra". Spacing
  // works when the things being spaced are of similar height. A task carries its
  // runs under it, so one task can be ten lines and the next two, and the gap
  // between them reads as more of the same task rather than as a boundary.
  //
  // The alternative that would have kept the rule -- a surface per task instead
  // of a line between them -- was not taken, because a line is what was asked
  // for. Reversing this is two class strings and this comment.
  "scheduled-tasks-panel.tsx": { rules: 3, why: "the pinned stack, plus a separator per task and per orphan" },
  "file-preview.tsx": { rules: 3, why: "the view tabs, the sheet tabs and the truncation notice" },
  // The PDF pane draws its own pages now — the browser's viewer, and the annotation tools
  // it ships that nothing here can save, went with the `<object>`. Its footer is the page
  // and zoom readout, and the pages scroll under it.
  "pdf-pane.tsx": { rules: 1, why: "the pages scroll under the page and zoom bar" },
  // Not sidebar or pane chrome: a modal of its own, whose toolbar and footer frame a
  // scrolling editor. Listed so its count is a decision rather than an omission.
  "markdown-editor.tsx": { rules: 4, why: "a dialog's own header, toolbar, split and footer" },
  // The dock is a strip pinned to the bottom of the centre column; its rules are the
  // top edges of stacked entries, not separators inside a scrolling list.
  "turn-dock.tsx": { rules: 1, why: "the expanded list's top edge against the strip" },

  // THE CENTRE PANE, which this sweep did not reach. The report was about the sidebar and
  // the pane beside the conversation; the same rule applies here and the diff belongs to
  // its own pass, the way FR-1.4 puts `/admin` in one. Listed with a count rather than
  // skipped, so the pass that does reach them starts from a number.
  //
  // `workspace-grid.tsx` was here at 1 -- the hairline under each tenant heading -- and
  // came off the list on its own, without the pass: rebuilding the picker as one row per
  // agent removed the tenant headings, and the rule went with them. It is now held at
  // zero by the default, which is the outcome the pass was for.
  "composer.tsx": { rules: 1, why: "a divider inside the attach POPOVER, which FR-1.4 leaves alone" },
};

const CHAT_FILES = readdirSync(join(ROOT, "app/chat"))
  .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
  .sort();

describe("the sidebar and the right pane draw as few horizontal rules as they can", () => {
  for (const name of CHAT_FILES) {
    const expected = PINNED[name];
    const label = expected
      ? `${name} — ${expected.rules} (${expected.why})`
      : `${name} — none`;
    it(label, () => {
      expect(horizontalRules(source(join("app/chat", name)))).toBe(expected?.rules ?? 0);
    });
  }
});

// The file preview and the chat agree about what a document looks like, which is what
// `message-content.tsx` is the reference FOR (DEC-3). Asserted as SHARED TOKENS rather
// than as pixels: what went wrong was a second grammar, not a wrong number.
describe("a document looks the same wherever it is read", () => {
  const preview = source("app/chat/file-preview.tsx");
  const chat = source("app/chat/message-content.tsx");

  // The spreadsheet grid was `border-rule` at `px-2 py-1` — `--rule` is the brand-tinted
  // boundary the FRAME around a document is drawn in, and using it for the document's own
  // grid made a sheet look like a different product from the same data in the chat.
  it("draws a cell's border in the text's own colour, not in the chrome's", () => {
    expect(chat).toContain("border-current/15");
    expect(preview).toContain("border border-current/15 px-3 py-2");
    expect(preview).not.toContain("border border-rule px-2 py-1");
  });

  // A one-off hex in exactly one place in the repository, warmer than dark `--fg`, so
  // every preview read cooler and brighter than the same content in the transcript.
  it("reads long-form text in one colour, from a token", () => {
    expect(source("app/globals.css")).toContain("--reading-fg");
    // The CLASS, not the string: chat-view.tsx names the old hex in the comment that
    // explains why it moved, and asserting the name away would delete the explanation.
    expect(chat + preview + source("app/chat/chat-view.tsx")).not.toContain("text-[#c9c7be]");
    expect(source("app/chat/chat-view.tsx")).toContain("text-reading-fg");
    expect(preview).toContain("text-reading-fg");
  });

  // The three the docx body was missing. The two it still departs in — `border-collapse`
  // and the absent width clamps — are named in DOCX_BODY's own comment with their
  // reasons, and are not asserted here because they are deliberate.
  it("gives a word-processor table the markdown table's header tint, wrap and rhythm", () => {
    expect(chat).toContain("[&_thead_th]:bg-current/[0.05]");
    expect(preview).toContain("[&_thead_th]:bg-current/[0.05]");
    expect(preview).toContain("[&_td]:[overflow-wrap:break-word]");
    expect(preview).toContain("[&_table]:my-4");
  });
});
