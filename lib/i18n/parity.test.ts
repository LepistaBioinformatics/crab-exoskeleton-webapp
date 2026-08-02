import { describe, it, expect } from "vitest";
import type { Locale } from "./config";
import { commonCopy } from "./common";
import { errorCopy } from "./errors";
import { signInCopy } from "./signin";
import { onboardingCopy } from "./onboarding";
import { offlineCopy } from "./offline";
import { chatCopy } from "./chat";
import { adminCopy } from "./admin";
import { landingCopy } from "./landing";

// `pt: SomeDict = {...}` makes tsc enforce that every KEY exists in both
// locales -- but nothing stops a copy-paste from leaving an English VALUE in
// the pt block, and a missed translation looks exactly like a correct one to
// the compiler. This test closes that gap: any leaf string identical in both
// locales has to be listed below as deliberate.

const NAMESPACES: Record<string, Record<Locale, unknown>> = {
  common: commonCopy,
  errors: errorCopy,
  signin: signInCopy,
  onboarding: onboardingCopy,
  offline: offlineCopy,
  chat: chatCopy,
  admin: adminCopy,
  landing: landingCopy,
};

// Identical on purpose: loanwords Portuguese uses as-is, product names,
// identifiers, query syntax, numerals and punctuation.
const SHARED = new Set([
  "common.metadata.titleSuffix",
  "signin.titleSuffix",
  "offline.metaTitle",
  "chat.shell.workspaces",
  "chat.uploads.workspace",
  "chat.viewMode.chat",
  "chat.viewMode.canvas",
  "chat.markdownEditor.tools.link",
  "chat.search.tag",
  "chat.enrichment.tagsOne",
  "chat.enrichment.tagsOther",
  "chat.canvas.msgOne",
  "chat.canvas.msgOther",
  "admin.shell.tabs.skills",
  // A dotted config.json path and a JSON literal. Both are what the admin types
  // verbatim into the field, so translating either would be wrong.
  "admin.bulkConfig.keyPlaceholder",
  "admin.bulkConfig.valuePlaceholder",
  "admin.shell.period",
  "admin.scope.tenantPrefix",
  "admin.ladderRungs.tenant",
  "admin.ladderRungs.tenantNamed",
  "admin.models.keyGoesToAfter",
  "admin.models.chainExplainAfter",
  "admin.branding.logosHeading",
  "landing.thought.index",
  "landing.memory.index",
  "landing.memory.filterHint",
  "landing.graph.index",
  // The entity in the knowledge-graph figure is a product name, so it is the same in
  // both locales. Its TYPE ("project"/"projeto") is translated, which is what proves
  // the figure is localised rather than just left in English.
  "landing.graph.entity",
  "landing.isolation.index",
  "landing.defense.index",
  "landing.hierarchy.index",
  "landing.hierarchy.labels.tenant",
  "landing.hierarchy.sample.tenant",
  "landing.hierarchy.sample.agentA",
  "landing.hierarchy.sample.agentB",
  "landing.templates.index",
  "landing.files.index",
]);

function collide(path: string, en: unknown, pt: unknown, out: string[]) {
  if (typeof en === "string") {
    if (en === pt && !SHARED.has(path)) out.push(`${path} :: ${JSON.stringify(en)}`);
    return;
  }
  if (Array.isArray(en)) {
    en.forEach((v, i) => collide(`${path}[${i}]`, v, (pt as unknown[])[i], out));
    return;
  }
  if (en && typeof en === "object") {
    for (const k of Object.keys(en as object)) {
      collide(`${path}.${k}`, (en as Record<string, unknown>)[k], (pt as Record<string, unknown>)[k], out);
    }
  }
}

describe("dictionary parity", () => {
  it("has no pt string left identical to its en original", () => {
    const untranslated: string[] = [];
    for (const [name, dict] of Object.entries(NAMESPACES)) {
      collide(name, dict.en, dict.pt, untranslated);
    }
    expect(untranslated).toEqual([]);
  });

  it("keeps the shared-string allowlist honest", () => {
    // A path that stops colliding (because one side was reworded) should be
    // removed from SHARED rather than left to rot.
    const colliding: string[] = [];
    for (const [name, dict] of Object.entries(NAMESPACES)) {
      const all: string[] = [];
      collide(name, dict.en, dict.pt, all);
      colliding.push(...all);
    }
    expect(colliding).toEqual([]);
    for (const path of SHARED) {
      const [ns, ...rest] = path.split(".");
      let en: unknown = NAMESPACES[ns].en;
      let pt: unknown = NAMESPACES[ns].pt;
      for (const k of rest) {
        en = (en as Record<string, unknown>)[k];
        pt = (pt as Record<string, unknown>)[k];
      }
      expect(en, `${path} is allowlisted but no longer collides`).toBe(pt);
    }
  });
});
