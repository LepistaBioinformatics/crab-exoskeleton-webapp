import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachNote, offeredScopes, type AudienceScope } from "./mangrove-audience";
import { chatCopy } from "@/lib/i18n/chat";

// HOW FAR A POST GOES, AND WHETHER THE CONTROL SAYS SO.
//
// The four scopes were a flat row of equal segments: `Only you` · `People` ·
// `Everybody in this subscription` · `Everybody in this tenant`. Same width, same
// weight, same colour. The control said "here are four alternatives" and said nothing
// about three of them CONTAINING the ones before — so a member picking the tenant had
// no way to see they had just crossed from a handful of named people to every account
// in the organisation.
//
// The rung and its note are plain functions, so what they answer is asserted here
// without mounting anything. What only the DOM can say — that the rows are a column,
// that the chosen rung and every narrower one are marked — is in
// `mangrove-compose.test.tsx`, which already mounts the picker.

const en = chatCopy.en;
const pt = chatCopy.pt;

const LADDER: AudienceScope[] = ["private", "people", "subscription", "tenant"];

describe("what each step says it contains", () => {
  it("answers for every scope, in both locales", () => {
    for (const dict of [en, pt]) {
      for (const s of LADDER) {
        expect(reachNote(s, dict, 0), `${s} has no reach note`).toBeTruthy();
      }
    }
  });

  // THE ONE REAL NUMBER THIS UI HOLDS. The list under `people` is one the member built
  // themselves, so it can be counted honestly.
  it("counts the people the member has actually named", () => {
    expect(reachNote("people", en, 3)).toContain("3");
    expect(reachNote("people", en, 1)).toContain("1");
  });

  it("says nothing about a count at zero, rather than '0 so far'", () => {
    expect(reachNote("people", en, 0)).toBe(en.mangrove.reachPeople);
  });

  // NO INVENTED NUMBERS, and this is the assertion that keeps it that way.
  //
  // There is no count for a subscription or a tenant anywhere this app can reach: the
  // directory is a SEARCH, and in `exact` mode it will not enumerate at all. Any
  // figure here would have to be made up, and a wrong number about who can read a
  // memory is worse than no number — so the widening is said as containment.
  it("puts no figure on a subscription or a tenant, however many people are picked", () => {
    for (const s of ["subscription", "tenant"] as const) {
      for (const picked of [0, 1, 40]) {
        expect(reachNote(s, en, picked), `${s} grew a number`).not.toMatch(/\d/);
      }
    }
  });

  // A CHANGE OF KIND, not only of size — which is what the request named: "more people
  // AND accounts". A subscription is people; a tenant is subscriptions, each with its
  // own people. "Even more people" would undersell what is being crossed.
  it("says the widest step crosses subscriptions, not just more people", () => {
    expect(reachNote("tenant", en, 0).toLowerCase()).toContain("subscription");
    expect(reachNote("tenant", pt, 0).toLowerCase()).toContain("assinatura");
  });
});

// The ladder is drawn from `offeredScopes`, which is also what decides which rungs a
// member may pick at all. Two orderings would be two answers to "is the tenant wider
// than the subscription", and only one of them would be on screen.
describe("the order the rungs are drawn in", () => {
  it("is the containment order, and comes from offeredScopes", () => {
    const all = offeredScopes({ governs: true, tenantLicensed: true }, true);
    expect(all).toEqual(LADDER);
  });

  it("stays in that order when a member may not address a group", () => {
    expect(offeredScopes({ governs: false, tenantLicensed: false }, true)).toEqual([
      "private",
      "people",
    ]);
  });
});

// THE WIDTHS ARE ABSOLUTE, not relative to what this member happens to be offered.
//
// Scaling by position within `offered` would make `people` half-width for somebody who
// governs nothing and quarter-width for somebody who governs a tenant — the same
// choice drawn as two different sizes, and a member who cannot address the tenant
// would see `subscription` drawn as the widest thing that exists.
describe("the ladder the widths are measured against", () => {
  const src = readFileSync(join(__dirname, "mangrove-audience.tsx"), "utf8");

  it("is the whole ladder, whatever is offered", () => {
    const m = /const LADDER: readonly AudienceScope\[\] = \[([^\]]+)\]/.exec(src);
    expect(m, "the LADDER constant moved; this test reads it by shape").not.toBeNull();
    const names = [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    expect(names).toEqual(LADDER);
  });

  it("measures the fill against LADDER.length rather than the offered count", () => {
    expect(src).toContain("/ LADDER.length");
    expect(src, "a width scaled by what is offered redraws the same choice per member")
      .not.toMatch(/offered\.length\s*\)\s*\*\s*100/);
  });
});
