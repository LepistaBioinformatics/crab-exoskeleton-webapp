import { describe, it, expect } from "vitest";
import { initials } from "./avatar";

// These stand in for a name where an icon used to be, so two letters that carry nothing are
// worse than the icon was. The names in play are mostly identifiers, which is why splitting
// on whitespace alone was not enough.
describe("initials", () => {
  it("takes one letter from each of the first two parts of a hyphenated name", () => {
    expect(initials("hermes-glm")).toBe("HG");
  });

  it("treats underscores, dots, colons and slashes as breaks too", () => {
    expect(initials("assay_pipeline")).toBe("AP");
    expect(initials("acme.growth")).toBe("AG");
    expect(initials("team:core")).toBe("TC");
    expect(initials("a/b")).toBe("AB");
  });

  it("breaks camelCase, which whitespace splitting cannot see", () => {
    expect(initials("assayPipeline")).toBe("AP");
    expect(initials("myAgent2")).toBe("MA");
  });

  it("still handles ordinary words", () => {
    expect(initials("Acme Bioinformatics")).toBe("AB");
  });

  // A "first letter plus next consonant" rule was tried here and reverted: it gave BT for
  // both Biotrop and beta, where BI and BE are what a reader recognises. Single words keep
  // their first two letters.
  it("keeps the first two letters of a single word", () => {
    expect(initials("alpha")).toBe("AL");
    expect(initials("beta")).toBe("BE");
    expect(initials("Biotrop")).toBe("BI");
  });

  it("degrades instead of throwing", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials("x")).toBe("X");
    expect(initials("--")).toBe("?");
  });
});
