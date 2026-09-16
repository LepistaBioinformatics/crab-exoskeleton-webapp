import { describe, it, expect } from "vitest";
import {
  BRAND_MAX_CHARS,
  BRAND_MAX_EDGE,
  fitWithin,
  isWithinBrandLimit,
} from "./brandImage";

describe("fitWithin", () => {
  it("leaves an image that already fits alone", () => {
    expect(fitWithin(120, 80)).toEqual({ width: 120, height: 80 });
  });

  it("scales the longest edge down and keeps the ratio", () => {
    expect(fitWithin(1024, 512)).toEqual({ width: BRAND_MAX_EDGE, height: 128 });
    expect(fitWithin(512, 1024)).toEqual({ width: 128, height: BRAND_MAX_EDGE });
  });

  // A very wide banner would otherwise round its short edge to zero, and a canvas
  // of height 0 draws nothing -- a logo that uploads successfully and is blank.
  it("never rounds an edge away to nothing", () => {
    expect(fitWithin(4000, 3).height).toBe(1);
  });

  it("does not divide by zero on a degenerate image", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("isWithinBrandLimit", () => {
  it("accepts a normal encoded logo", () => {
    expect(isWithinBrandLimit("data:image/webp;base64," + "a".repeat(1000))).toBe(true);
  });

  // Refused here rather than sent: the tag's meta map is not a blob store, and the
  // failure upstream would arrive as a deserialization error naming nothing a
  // person could act on.
  it("refuses one that is still too large after resizing", () => {
    expect(isWithinBrandLimit("a".repeat(BRAND_MAX_CHARS + 1))).toBe(false);
  });
});
