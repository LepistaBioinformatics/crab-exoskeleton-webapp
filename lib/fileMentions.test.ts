import { describe, it, expect } from "vitest";
import {
  applyMention,
  filterCandidates,
  mentionQueryAt,
  resolveMentions,
  type MentionCandidate,
} from "./fileMentions";

const files: MentionCandidate[] = [
  { name: "logo.png", path: "uploads/logo.png" },
  { name: "reports/q1.pdf", path: "uploads/reports/q1.pdf" },
  { name: "notes.md", path: "uploads/notes.md" },
];

// The rule the member asked for by name: inside double quotes, `@` is just a
// character. It is also why the token is resolved from the TEXT at send time instead
// of being committed when the menu is used — wrapping it in quotes afterwards has to
// be able to turn it back into prose.
describe("quotes turn a mention back into text", () => {
  it("resolves an unquoted mention", () => {
    expect(resolveMentions("veja @logo.png", files).map((f) => f.path)).toEqual([
      "uploads/logo.png",
    ]);
  });

  it("ignores one inside a quoted span", () => {
    expect(resolveMentions('ele disse "olhe o @logo.png"', files)).toEqual([]);
  });

  it("ignores one where the quote opens immediately before it", () => {
    expect(resolveMentions('"@logo.png"', files)).toEqual([]);
  });

  // An unterminated quote is still the member quoting. Requiring the closing one
  // would make the rule depend on text not yet typed.
  it("ignores one after an unclosed quote", () => {
    expect(resolveMentions('ele disse "olhe o @logo.png', files)).toEqual([]);
  });

  it("resolves again after a quoted span closes", () => {
    const got = resolveMentions('"@logo.png" mas use @notes.md', files);
    expect(got.map((f) => f.path)).toEqual(["uploads/notes.md"]);
  });

  // The apostrophe case, and the reason single quotes are NOT delimiters: one of
  // these in ordinary prose would otherwise disable every reference after it.
  it("is unaffected by apostrophes", () => {
    expect(resolveMentions("it's here, d'água: @logo.png", files).map((f) => f.path)).toEqual([
      "uploads/logo.png",
    ]);
  });
});

describe("resolveMentions", () => {
  it("only resolves names the workspace actually has", () => {
    expect(resolveMentions("@ghost.png and @logo.png", files).map((f) => f.name)).toEqual([
      "logo.png",
    ]);
  });

  // An email is the everyday false positive. It is not a path anyone has, so the
  // listing lookup rejects it without a special case.
  it("does not treat an email address as a reference", () => {
    expect(resolveMentions("escreva para samuel@biotrop.com.br", files)).toEqual([]);
  });

  it("handles a path with folders", () => {
    expect(resolveMentions("compare @reports/q1.pdf", files).map((f) => f.path)).toEqual([
      "uploads/reports/q1.pdf",
    ]);
  });

  it("stops the token at sentence punctuation", () => {
    expect(resolveMentions("veja @logo.png, obrigado", files).map((f) => f.name)).toEqual([
      "logo.png",
    ]);
  });

  it("collapses a file mentioned twice", () => {
    expect(resolveMentions("@logo.png e de novo @logo.png", files)).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(resolveMentions("@LOGO.PNG", files).map((f) => f.name)).toEqual(["logo.png"]);
  });

  it("finds nothing in a message with no mentions", () => {
    expect(resolveMentions("bom dia", files)).toEqual([]);
  });
});

describe("mentionQueryAt", () => {
  it("returns an empty query right after the @", () => {
    expect(mentionQueryAt("veja @", 6)).toBe("");
  });

  it("returns the partial token", () => {
    expect(mentionQueryAt("veja @log", 9)).toBe("log");
  });

  it("closes at whitespace", () => {
    expect(mentionQueryAt("veja @logo.png agora", 20)).toBeNull();
  });

  it("is null with no @ before the caret", () => {
    expect(mentionQueryAt("bom dia", 7)).toBeNull();
  });

  // The menu must not open while the member is quoting.
  it("is null inside a quoted span", () => {
    expect(mentionQueryAt('ele disse "@log', 15)).toBeNull();
  });

  it("reads the mention at the caret, not a later one", () => {
    const text = "@logo.png e @not";
    expect(mentionQueryAt(text, 9)).toBe("logo.png");
  });
});

describe("filterCandidates", () => {
  it("lists everything for an empty query", () => {
    expect(filterCandidates(files, "")).toHaveLength(3);
  });

  it("matches anywhere in the path, case-insensitively", () => {
    expect(filterCandidates(files, "Q1").map((f) => f.name)).toEqual(["reports/q1.pdf"]);
  });
});

describe("applyMention", () => {
  it("replaces the partial token and leaves a trailing space", () => {
    // Without the space the next keystroke would extend the token just chosen.
    expect(applyMention("veja @log", 9, "logo.png")).toEqual({
      text: "veja @logo.png ",
      caret: 15,
    });
  });

  it("keeps whatever followed the caret", () => {
    expect(applyMention("veja @log agora", 9, "logo.png")).toEqual({
      text: "veja @logo.png  agora",
      caret: 15,
    });
  });
});
