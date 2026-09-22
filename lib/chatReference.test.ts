import { describe, expect, it } from "vitest";
import {
  buildReferenceMarker,
  referenceChip,
  type EntityReference,
  type MangroveReference,
} from "./chatReference";
import { chatCopy } from "@/lib/i18n/chat";

// The entity variant. The rule every reference here follows is that it names a thing and never
// inlines its content — the agent owns the graph, the transcripts and the files, so a copy would
// only bloat the transcript and go stale.

const t = chatCopy.en;

const entity: EntityReference = {
  kind: "entity",
  name: "ledger",
  entityType: "system",
  observations: 7,
  relations: 4,
};

describe("referenceChip — entity", () => {
  it("names the kind and previews the entity", () => {
    const { title, preview } = referenceChip(entity, t);
    expect(title).toBe(t.memoryGraph.referencedEntity);
    expect(preview).toContain("ledger");
    expect(preview).toContain("system");
  });
});

describe("buildReferenceMarker — entity", () => {
  it("is one self-contained bracketed line", () => {
    const marker = buildReferenceMarker(entity, t);
    expect(marker.startsWith("[")).toBe(true);
    expect(marker.endsWith("]")).toBe(true);
    expect(marker).not.toContain("\n");
  });

  it("carries the name, the type and the shape", () => {
    const marker = buildReferenceMarker(entity, t);
    expect(marker).toContain('"ledger"');
    expect(marker).toContain("system");
    expect(marker).toContain("7");
    expect(marker).toContain("4");
  });

  // The name is a LOOKUP KEY: it is what the agent's own open_nodes takes. Shipping the
  // observations would duplicate into the transcript exactly what the agent can read for itself,
  // and would be wrong the moment the agent wrote another one.
  it("does not inline what the agent can read for itself", () => {
    const marker = buildReferenceMarker(
      { ...entity, name: "alice" },
      t,
    );
    expect(marker).toContain('"alice"');
    // The shape is counts only — no observation text ever passes through this type.
    expect(Object.keys(entity)).toEqual([
      "kind",
      "name",
      "entityType",
      "observations",
      "relations",
    ]);
  });

  it("is translated, so the agent reads it in the member's language", () => {
    const pt = buildReferenceMarker(entity, chatCopy.pt);
    expect(pt).toContain(chatCopy.pt.memoryGraph.markerEntity);
    expect(pt).not.toContain(chatCopy.en.memoryGraph.markerEntity);
  });
});


// The mangrove variant. Same rule, and one extra reason for it: two of the three things a
// mangrove memory can BE have no text to inline at all -- a published file is bytes behind a
// digest, and a graph fragment is JSON. The id is what the agent resolves through
// mangrove_timeline, which makes it the one field that has to survive.

const post: MangroveReference = {
  kind: "mangrove",
  objectId: "mangrove:obj:9f3",
  cell: "soil-ph",
  author: "bob (bot)",
};

describe("referenceChip — mangrove", () => {
  it("names the kind and previews the cell and the author", () => {
    const { title, preview } = referenceChip(post, t);
    expect(title).toBe(t.mangrove.referencedPost);
    expect(preview).toContain("soil-ph");
    expect(preview).toContain("bob (bot)");
  });
});

describe("buildReferenceMarker — mangrove", () => {
  it("carries the OBJECT ID, which is what the agent looks it up by", () => {
    expect(buildReferenceMarker(post, t)).toContain("mangrove:obj:9f3");
  });

  it("is one self-contained bracketed line", () => {
    const marker = buildReferenceMarker(post, t);
    expect(marker.startsWith("[")).toBe(true);
    expect(marker.endsWith("]")).toBe(true);
    expect(marker).not.toContain("\n");
  });

  // The cell and the author are for the chip the member reads. Two authors can hold a
  // position on one cell, so the pair is not an identity and must not be what is resolved.
  it("names the cell and the author beside the id, and inlines no body", () => {
    const marker = buildReferenceMarker(post, t);
    expect(marker).toContain('"soil-ph"');
    expect(marker).toContain("bob (bot)");
    expect(Object.keys(post)).toEqual(["kind", "objectId", "cell", "author"]);
  });

  it("is translated, so the agent reads it in the member's language", () => {
    const pt = buildReferenceMarker(post, chatCopy.pt);
    expect(pt).toContain(chatCopy.pt.mangrove.markerPost);
    expect(pt).not.toContain(chatCopy.en.mangrove.markerPost);
  });
});
