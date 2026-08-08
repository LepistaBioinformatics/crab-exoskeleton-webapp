import { describe, it, expect } from "vitest";
import { projectInitials } from "./projects";

// The collapsed rail draws these instead of a name. Two projects that reduce to the
// same two letters are indistinguishable there, so what this really guards is that the
// reduction uses as much of the name as it can.

describe("projectInitials", () => {
  it("takes one initial from each of the first two words", () => {
    expect(projectInitials("Field Trial")).toBe("FT");
    expect(projectInitials("Pesquisa Soja 2026")).toBe("PS");
  });

  // A single letter collides across a handful of projects far too readily -- "Soja"
  // and "Sorgo" would both be S.
  it("takes two letters from a single word", () => {
    expect(projectInitials("Soja")).toBe("So");
    expect(projectInitials("Sorgo")).toBe("So");
    expect(projectInitials("X")).toBe("X");
  });

  // Separators people actually type into project names, so "field-trial" is not one
  // word ending up as "fi".
  it("splits on hyphens, underscores and slashes", () => {
    expect(projectInitials("field-trial")).toBe("ft");
    expect(projectInitials("field_trial")).toBe("ft");
    expect(projectInitials("field/trial")).toBe("ft");
  });

  // A leading year or bullet is not a letter of the name. Without this, "2026 — Soy"
  // reduces to "2S", which reads as neither.
  it("skips words that carry no letters or digits", () => {
    expect(projectInitials("— Soja")).toBe("So");
    expect(projectInitials("### ***")).toBe("");
  });

  it("keeps accented initials rather than dropping them", () => {
    expect(projectInitials("Área Experimental")).toBe("ÁE");
    expect(projectInitials("Ácido")).toBe("Ác");
  });

  it("returns empty for an empty or blank name", () => {
    expect(projectInitials("")).toBe("");
    expect(projectInitials("   ")).toBe("");
  });
});
