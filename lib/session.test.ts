import { describe, it, expect } from "vitest";
import { isSessionExpired, parseSession, tokenExpiry } from "./session";

// A JWT-shaped token: the middle segment is base64url with the padding stripped,
// which is what a real one looks like and what the decoder has to cope with.
function jwt(claims: Record<string, unknown>): string {
  const seg = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${seg({ alg: "HS256", typ: "JWT" })}.${seg(claims)}.signature`;
}

describe("parseSession", () => {
  it("reads a stored session", () => {
    const raw = JSON.stringify({ token: "t", email: "ana@x.com", accountReady: true });
    expect(parseSession(raw)).toEqual({ token: "t", email: "ana@x.com", accountReady: true });
  });

  it("returns null for an absent, unparseable or incomplete cookie", () => {
    expect(parseSession(undefined)).toBeNull();
    expect(parseSession("")).toBeNull();
    expect(parseSession("not json")).toBeNull();
    expect(parseSession(JSON.stringify({ token: "t" }))).toBeNull();
    expect(parseSession(JSON.stringify({ email: "ana@x.com" }))).toBeNull();
  });
});

describe("tokenExpiry", () => {
  it("reads `exp` and converts it from seconds to milliseconds", () => {
    expect(tokenExpiry(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it("survives a payload carrying non-ASCII claims", () => {
    // A real profile can hold an accented name; a decoder that assumed latin1
    // would throw here and report the session as live forever.
    expect(tokenExpiry(jwt({ exp: 1_700_000_000, name: "Ana Gonçalves" }))).toBe(1_700_000_000_000);
  });

  // Unreadable means "no opinion", never "expired": this decoder does not verify
  // a signature, so it must not be able to lock anyone out on its own.
  it("returns null for anything it cannot read an exp from", () => {
    expect(tokenExpiry("opaque-token")).toBeNull();
    expect(tokenExpiry("")).toBeNull();
    expect(tokenExpiry("a.!!!not-base64!!!.c")).toBeNull();
    expect(tokenExpiry(jwt({ sub: "no exp here" }))).toBeNull();
    expect(tokenExpiry(jwt({ exp: "1700000000" }))).toBeNull();
  });
});

describe("isSessionExpired", () => {
  const now = 1_700_000_000_000;

  it("is expired once the clock reaches exp", () => {
    expect(isSessionExpired({ token: jwt({ exp: 1_699_999_999 }), email: "a@x" }, now)).toBe(true);
    expect(isSessionExpired({ token: jwt({ exp: 1_700_000_000 }), email: "a@x" }, now)).toBe(true);
  });

  it("is live while exp is in the future", () => {
    expect(isSessionExpired({ token: jwt({ exp: 1_700_000_060 }), email: "a@x" }, now)).toBe(false);
  });

  // The whole point of the tolerant decoder: an opaque token keeps working exactly
  // as it did before this check existed.
  it("treats a token with no readable exp as live", () => {
    expect(isSessionExpired({ token: "opaque-token", email: "a@x" }, now)).toBe(false);
  });
});
