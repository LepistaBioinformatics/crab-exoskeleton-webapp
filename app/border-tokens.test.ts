import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// EVERY BORDER COLOUR IS A TOKEN from app/globals.css -- `rule`, `rule-strong`,
// `rule-emphasis`, `focus` -- so changing the palette is one edit there. A component that
// names a hue directly for an edge (`border-accent`, `ring-brand/40`) is the edge that
// stays behind the next time the palette moves, which is what happened to the violet and
// cyan borders the owner asked to make neutral on 2026-10-13.
//
// Asserted over source text, comments excluded: a class string is invisible to tsc.

const ROOT = join(__dirname, "..");
const HUE_EDGE =
  /\b(?:border|ring|outline|divide)(?:-[trblxy])?-(?:brand|accent|sky|blue|violet|purple|indigo|cyan)\b/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("border colours", () => {
  it("come from the border tokens, never from a hue", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => sources(join(ROOT, d)))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
          .flatMap((line) => line.match(HUE_EDGE) ?? [])
          .map((cls) => `${relative(ROOT, path)}: ${cls}`),
      );
    expect(offenders).toEqual([]);
  });
});
