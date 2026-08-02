import { describe, it, expect } from "vitest";
import { landingCopy } from "@/lib/i18n/landing";
import { LOCALES } from "@/lib/i18n/config";

// The landing page makes product claims, and the ones about the knowledge graph are
// easy to overstate in ways that read as normal marketing. These assert the limits from
// .specs/features/landing-refresh-memory-graph/spec.md against the actual copy, in both
// locales, because a spec nobody checks is a spec that drifts.
//
// Each rule below corresponds to something the code does NOT do.

function allText(locale: (typeof LOCALES)[number]): string {
  return JSON.stringify(landingCopy[locale]).toLowerCase();
}

function graphText(locale: (typeof LOCALES)[number]): string {
  return JSON.stringify(landingCopy[locale].graph).toLowerCase();
}

describe("landing accuracy — the knowledge graph", () => {
  for (const locale of LOCALES) {
    // NFR-2. The ranking is BM25 over entity names, types and observation text
    // (memgraph/search.go). The MCP tool is *called* semantic_search for upstream
    // compatibility and its own description says lexical; the landing has no such
    // excuse, and "semantic" would promise synonym and paraphrase matching.
    it(`[${locale}] never calls the search semantic, neural or embedding-based`, () => {
      const text = allText(locale);
      for (const banned of [
        "semantic",
        "semântic",
        "semantica",
        "embedding",
        "neural",
        "vector search",
        "busca vetorial",
      ]) {
        expect(text, `the copy claims "${banned}" — the ranking is BM25 lexical`).not.toContain(
          banned,
        );
      }
    });

    // NFR-3. The graph is scoped per {tenant, subscription, agent, user}. Two members
    // share nothing, and one member's alpha and beta graphs are separate.
    it(`[${locale}] never implies shared or team memory`, () => {
      const text = graphText(locale);
      for (const banned of [
        "team knowledge",
        "shared memory",
        "your team's",
        "memória compartilhada",
        "conhecimento da equipe",
        "conhecimento do time",
      ]) {
        expect(text, `the copy implies "${banned}" — the graph is per member per agent`).not.toContain(
          banned,
        );
      }
    });

    // NFR-5. The UI is read-only in v1: no archive, delete or merge from the interface.
    it(`[${locale}] never offers to edit or curate the graph`, () => {
      const text = graphText(locale);
      for (const banned of ["edit the graph", "curate", "edite o grafo", "cure o grafo"]) {
        expect(text, `the copy offers "${banned}" — the interface is read-only`).not.toContain(
          banned,
        );
      }
    });

    // NFR-4. Provenance exists only when exactly one turn is in flight; a scheduled
    // job, the heartbeat, or two chats at once produce a fact with no conversation.
    it(`[${locale}] qualifies the provenance claim rather than promising it always`, () => {
      const body = landingCopy[locale].graph.body.toLowerCase();
      const qualifiers = ["when it can be traced", "quando dá para rastrear"];
      expect(
        qualifiers.some((q) => body.includes(q)),
        "the body claims each fact links to a conversation with no qualifier; " +
          "attribution is impossible for cron, heartbeat and concurrent chats",
      ).toBe(true);
    });

    // The one claim that IS a differentiator and IS true: the MCP server runs inside
    // the gateway. Asserted positively so a rewrite cannot quietly drop the only thing
    // that distinguishes this from bolting on somebody else's service.
    it(`[${locale}] states that the server runs inside the gateway`, () => {
      const text = graphText(locale);
      const claims = ["inside the gateway", "dentro do gateway"];
      expect(claims.some((c) => text.includes(c))).toBe(true);
      const noContainer = ["no extra container", "sem container extra"];
      expect(noContainer.some((c) => text.includes(c))).toBe(true);
    });
  }
});

describe("landing accuracy — files", () => {
  for (const locale of LOCALES) {
    // The older accuracy note (landing-page-and-i18n) still holds for FILES: search is
    // filename-substring only. The graph's text ranking is a different surface, and the
    // copy must not let one bleed into the other.
    it(`[${locale}] never promises search over file contents`, () => {
      const text = JSON.stringify(landingCopy[locale].files).toLowerCase();
      for (const banned of [
        "full-text",
        "full text",
        "inside your files",
        "file contents",
        "conteúdo dos arquivos",
        "texto completo",
      ]) {
        expect(text, `the copy claims "${banned}" — file search is filename-substring only`).not.toContain(
          banned,
        );
      }
    });

    // The capability that was actually added, asserted positively.
    it(`[${locale}] says folders can be made and things dragged between them`, () => {
      const body = landingCopy[locale].files.body.toLowerCase();
      const folders = ["folders", "pastas"];
      const drag = ["drag", "arraste"];
      expect(folders.some((f) => body.includes(f))).toBe(true);
      expect(drag.some((d) => body.includes(d))).toBe(true);
    });
  }
});

describe("landing structure", () => {
  // The narrative chain is what makes the page readable: every section's index is
  // unique and the sequence has no gap. Inserting a section is exactly when this breaks.
  it("numbers the sections consecutively with no repeats", () => {
    for (const locale of LOCALES) {
      const dict = landingCopy[locale] as unknown as Record<string, { index?: string }>;
      const indices = Object.values(dict)
        .map((v) => v?.index)
        .filter((v): v is string => typeof v === "string")
        .sort();
      expect(new Set(indices).size, `[${locale}] duplicate section index`).toBe(indices.length);
      indices.forEach((idx, i) => {
        expect(idx, `[${locale}] gap in the section numbering`).toBe(
          String(i + 1).padStart(2, "0"),
        );
      });
    }
  });
});
