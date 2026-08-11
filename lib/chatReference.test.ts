import { describe, expect, it } from "vitest";
import { buildReferenceMarker, referenceChip, type EntityReference } from "./chatReference";
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
