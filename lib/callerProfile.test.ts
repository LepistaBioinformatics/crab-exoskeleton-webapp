import { describe, it, expect } from "vitest";
import {
  canManageDirectory,
  principalUserId,
  type CallerProfile,
} from "./callerProfile";

const profile = (over: Partial<CallerProfile> = {}): CallerProfile => ({
  isStaff: false,
  isManager: false,
  userId: "u-1",
  ...over,
});

describe("canManageDirectory", () => {
  it("admits staff and managers", () => {
    expect(canManageDirectory(profile({ isStaff: true }))).toBe(true);
    expect(canManageDirectory(profile({ isManager: true }))).toBe(true);
  });

  it("refuses an ordinary member", () => {
    expect(canManageDirectory(profile())).toBe(false);
  });

  // A profile that could not be read is not a profile without privileges -- but
  // it has to deny all the same, because the alternative is offering a console
  // whose every call will be refused.
  it("denies when the profile could not be read", () => {
    expect(canManageDirectory(null)).toBe(false);
  });
});

describe("principalUserId", () => {
  it("prefers the principal owner over the others", () => {
    expect(
      principalUserId([
        { id: "u-other" },
        { id: "u-principal", isPrincipal: true },
      ]),
    ).toBe("u-principal");
  });

  // A single-owner profile does not always carry the flag, and that owner is
  // still the caller. Returning null there would block tenant creation for the
  // ordinary case.
  it("falls back to the first usable owner when none is flagged", () => {
    expect(principalUserId([{ id: "u-1" }, { id: "u-2" }])).toBe("u-1");
  });

  it("skips entries carrying no usable id", () => {
    expect(principalUserId([{ id: "" }, { id: 7 }, { id: "u-3" }])).toBe("u-3");
  });

  // Null rather than an empty string: an empty ownerId would be sent, refused by
  // the user lookup, and reported as a malformed request rather than as the
  // missing identity it is.
  it("is null when there is no owner to name", () => {
    expect(principalUserId([])).toBeNull();
    expect(principalUserId(undefined)).toBeNull();
  });
});
