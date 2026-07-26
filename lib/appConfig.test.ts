import { describe, it, expect } from "vitest";
import { isEnvEnabled } from "./appConfig";

// START_AT_SIGNIN changes what an anonymous visitor sees at `/`, so the parse has
// to be unambiguous: only explicit truthy spellings turn it on, and anything
// unset or falsy leaves the landing page in place.
describe("isEnvEnabled", () => {
  it("accepts the documented truthy spellings, case- and space-insensitively", () => {
    for (const raw of ["1", "true", "TRUE", "yes", "on", " true "]) {
      expect(isEnvEnabled(raw)).toBe(true);
    }
  });

  it("treats unset, empty and falsy values as off", () => {
    for (const raw of [undefined, "", " ", "0", "false", "no", "off", "maybe"]) {
      expect(isEnvEnabled(raw)).toBe(false);
    }
  });
});
