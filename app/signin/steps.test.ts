import { describe, it, expect } from "vitest";
import { resolveLocation, signInUrl } from "./steps";

describe("resolveLocation", () => {
  it("stays on the code step when the URL carries both the step and the address", () => {
    // The bug this fixes: the step lived in useState, so a reload on the code
    // form dropped the user back to the e-mail form.
    expect(resolveLocation("code", "ana@x.com")).toEqual({ step: "code", email: "ana@x.com" });
  });

  it("falls back to the e-mail step when no step is on the URL", () => {
    expect(resolveLocation(null, null)).toEqual({ step: "email", email: "" });
  });

  // /api/auth/verify takes { email, code } -- a code form with no address is a
  // form that cannot submit, so a hand-edited URL must not reach one.
  it("falls back to the e-mail step when the address is missing or blank", () => {
    expect(resolveLocation("code", null).step).toBe("email");
    expect(resolveLocation("code", "   ").step).toBe("email");
  });

  it("keeps the address when falling back, so the input can seed from it", () => {
    expect(resolveLocation(null, "ana@x.com")).toEqual({ step: "email", email: "ana@x.com" });
  });

  it("does not honour a step it does not know", () => {
    expect(resolveLocation("verify", "ana@x.com").step).toBe("email");
  });

  it("trims the address rather than passing whitespace to the gateway", () => {
    expect(resolveLocation("code", " ana@x.com ")).toEqual({ step: "code", email: "ana@x.com" });
  });
});

describe("signInUrl", () => {
  it("puts the step and the address on the URL", () => {
    expect(signInUrl("", { step: "code", email: "ana@x.com" })).toBe(
      "/signin?step=code&email=ana%40x.com",
    );
  });

  it("clears both going back to the e-mail step", () => {
    expect(signInUrl("step=code&email=ana%40x.com", { step: "email" })).toBe("/signin");
  });

  // The transitions rebuild the query instead of replacing it, so a key this
  // screen knows nothing about survives a step change.
  it("preserves an unrelated query key in both directions", () => {
    expect(signInUrl("ref=launch", { step: "code", email: "ana@x.com" })).toBe(
      "/signin?ref=launch&step=code&email=ana%40x.com",
    );
    expect(signInUrl("ref=launch&step=code&email=ana%40x.com", { step: "email" })).toBe(
      "/signin?ref=launch",
    );
  });

  it("overwrites a stale address rather than appending a second one", () => {
    expect(signInUrl("step=code&email=old%40x.com", { step: "code", email: "new@x.com" })).toBe(
      "/signin?step=code&email=new%40x.com",
    );
  });
});
