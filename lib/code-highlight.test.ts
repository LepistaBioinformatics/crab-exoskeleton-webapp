import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach } from "vitest";
import { isKnownGrammar } from "./code-languages";
import {
  canonicalLanguage,
  highlight,
  isReady,
  isUnsupported,
  loadLanguage,
  __resetForTests,
  __statsForTests,
  ALIAS_KEYS,
} from "./code-highlight";

beforeEach(() => {
  __resetForTests();
});

describe("canonicalLanguage", () => {
  it("reads react-markdown's language-* class", () => {
    expect(canonicalLanguage("language-go")).toBe("go");
    expect(canonicalLanguage("hljs language-python extra")).toBe("python");
  });

  it("maps what people actually type onto highlight.js ids", () => {
    expect(canonicalLanguage("language-sh")).toBe("bash");
    expect(canonicalLanguage("language-zsh")).toBe("bash");
    expect(canonicalLanguage("language-ts")).toBe("typescript");
    expect(canonicalLanguage("language-tsx")).toBe("typescript");
    expect(canonicalLanguage("language-yml")).toBe("yaml");
    expect(canonicalLanguage("language-golang")).toBe("go");
    expect(canonicalLanguage("language-rs")).toBe("rust");
  });

  it("passes an unlisted token through as an id of its own", () => {
    // The alias table is a convenience, not a whitelist: a grammar highlight.js
    // supports and the table has never heard of still loads.
    expect(canonicalLanguage("language-elixir")).toBe("elixir");
    expect(canonicalLanguage("language-c")).toBe("c");
  });

  it("is null for inline code, a malformed class, and plaintext", () => {
    expect(canonicalLanguage(undefined)).toBeNull();
    expect(canonicalLanguage("")).toBeNull();
    expect(canonicalLanguage("some-other-class")).toBeNull();
    // plaintext is highlight.js's no-op grammar: loading it would buy nothing and
    // cost an innerHTML.
    expect(canonicalLanguage("language-plaintext")).toBeNull();
    expect(canonicalLanguage("language-txt")).toBeNull();
  });

  it("handles languages whose names carry punctuation", () => {
    expect(canonicalLanguage("language-c++")).toBe("cpp");
    expect(canonicalLanguage("language-objective-c")).toBe("objectivec");
  });
});

describe("loadLanguage", () => {
  it("registers a grammar and reports it ready", async () => {
    expect(isReady("go")).toBe(false);
    await expect(loadLanguage("go")).resolves.toBe(true);
    expect(isReady("go")).toBe(true);
  });

  it("is idempotent and collapses concurrent first calls", async () => {
    const [a, b, c] = await Promise.all([
      loadLanguage("json"),
      loadLanguage("json"),
      loadLanguage("json"),
    ]);
    expect([a, b, c]).toEqual([true, true, true]);
    await expect(loadLanguage("json")).resolves.toBe(true);
  });

  it("records an unknown grammar as unsupported instead of throwing or retrying", async () => {
    // The id came from text a member or the agent typed, so "no such grammar" is an
    // ordinary outcome; retrying it per re-render would be a request storm for a
    // block that will never colour.
    await expect(loadLanguage("not-a-real-language")).resolves.toBe(false);
    expect(isUnsupported("not-a-real-language")).toBe(true);
    await expect(loadLanguage("not-a-real-language")).resolves.toBe(false);
  });
});

describe("highlight", () => {
  it("returns null until the grammar is registered, so the caller can render plain", () => {
    expect(highlight("package main", "go")).toBeNull();
  });

  it("emits classed markup once the grammar is ready", async () => {
    await loadLanguage("go");
    const html = highlight('package main\n\nfunc main() { println("hi") }', "go");
    expect(html).toContain("hljs-");
    expect(html).toContain("package");
  });

  // The security boundary of the whole feature: the result is injected with
  // dangerouslySetInnerHTML, and chat content is authored by an LLM and by other
  // members. If highlight.js did not escape, every conversation would be an XSS
  // vector.
  it("escapes the code it is given", async () => {
    await loadLanguage("javascript");
    const html = highlight('const x = "<script>alert(1)</script>";', "javascript");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes markup even in a language with no rule for it", async () => {
    await loadLanguage("bash");
    const html = highlight('echo "<img src=x onerror=alert(1)>"', "bash");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  // Asserted through the miss counter, not by comparing return values: two equal
  // strings are identical under Object.is, so a value comparison passes whether the
  // cache exists or not.
  it("memoizes by (language, code), so a re-render does not re-highlight", async () => {
    await loadLanguage("go");
    const code = "package main";
    const first = highlight(code, "go");
    expect(__statsForTests().misses).toBe(1);
    expect(highlight(code, "go")).toEqual(first);
    expect(__statsForTests().misses).toBe(1);
  });

  it("keys the cache on the language too", async () => {
    await Promise.all([loadLanguage("go"), loadLanguage("python")]);
    const code = "import os";
    highlight(code, "go");
    highlight(code, "python");
    // Two entries, two computations: the same text under another grammar is not the
    // same result.
    expect(__statsForTests()).toEqual({ size: 2, misses: 2 });
  });

  it("stays bounded rather than growing with a long transcript", async () => {
    await loadLanguage("json");
    for (let i = 0; i <= 250; i++) highlight(`{"n":${i}}`, "json");
    expect(__statsForTests().size).toBeLessThanOrEqual(200);

    // The oldest entry was evicted, so re-asking for it costs a computation.
    const before = __statsForTests().misses;
    highlight('{"n":0}', "json");
    expect(__statsForTests().misses).toBe(before + 1);
  });

  it("counts a repeated hit as recently used, so it is not evicted next", async () => {
    await loadLanguage("json");
    const hot = '{"hot":true}';
    highlight(hot, "json");
    for (let i = 0; i < 199; i++) {
      highlight(`{"n":${i}}`, "json");
      highlight(hot, "json"); // touched on every insertion
    }
    const before = __statsForTests().misses;
    highlight(hot, "json");
    expect(__statsForTests().misses).toBe(before);
  });

  it("falls back to plain rather than throwing on input a grammar rejects", async () => {
    await loadLanguage("json");
    // Arbitrary chat text through a strict grammar must be a rendering decision,
    // never an exception in a message list.
    expect(() => highlight("}}}} not json at all {{{{", "json")).not.toThrow();
  });
});

describe("the alias table and the grammar map agree", () => {
  it("every alias points at a grammar that exists", async () => {
    // A dead alias is invisible: the block just renders plain, exactly like an
    // unknown language. `tf`/`hcl` → `terraform` was in the first version and
    // highlight.js has no terraform grammar at all.
    const targets = new Set<string>();
    for (const raw of ALIAS_KEYS) {
      const id = canonicalLanguage(`language-${raw}`);
      if (id) targets.add(id);
    }
    const dead = [...targets].filter((id) => !isKnownGrammar(id));
    expect(dead).toEqual([]);
  });

  it("maps a good spread of what an agent actually writes", () => {
    // Not an exhaustive list — a floor. Losing one of these silently is the
    // regression worth catching.
    for (const fence of ["go", "sh", "ts", "py", "yml", "json", "sql", "rs", "java", "php"]) {
      const id = canonicalLanguage(`language-${fence}`);
      expect(id, fence).not.toBeNull();
      expect(isKnownGrammar(id as string), `${fence} → ${id}`).toBe(true);
    }
  });
});

describe("the palette covers every class highlight.js can emit here", () => {
  it("styles each .hljs-* selector against a --syntax-* role", () => {
    // globals.css maps highlight.js's classes onto the app's own roles instead of
    // vendoring a highlight.js theme. A class added to the CSS without a colour, or
    // a colour that is not one of the roles, means the palette has quietly forked.
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const blocks = css.match(/(\.hljs-[\w-]+,?\s*)+\{[^}]*\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(4);
    for (const block of blocks) {
      const declaresColour = /color:\s*var\(--(syntax-[\w-]+|blocked)\)/.test(block);
      const styleOnly = /font-style|font-weight/.test(block);
      expect(declaresColour || styleOnly, block.slice(0, 80)).toBe(true);
    }
  });
});
