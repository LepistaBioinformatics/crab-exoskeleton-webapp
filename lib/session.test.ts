import { describe, it, expect } from "vitest";
import { isSessionExpired, parseSession, sessionCookieOptions, tokenExpiry } from "./session";

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

describe("sessionCookieOptions", () => {
  it("expires the cookie at the token's own exp, so it survives a browser restart", () => {
    const opts = sessionCookieOptions({ token: jwt({ exp: 1_700_000_000 }), email: "a@x" });
    expect(opts.expires).toEqual(new Date(1_700_000_000_000));
  });

  // The onboarding accountReady write re-sets the session with the SAME token. An
  // expiry computed as "now + jwtExpiresIn" would slide forward here and hand the
  // browser a cookie outliving the token it carries.
  it("gives the same expiry on a re-set with an unchanged token", () => {
    const token = jwt({ exp: 1_700_000_000 });
    expect(sessionCookieOptions({ token, email: "a@x" }).expires).toEqual(
      sessionCookieOptions({ token, email: "a@x", accountReady: true }).expires,
    );
  });

  // No default lifetime is invented: unreadable exp falls back to the session
  // cookie this always used to emit.
  it("omits expires when the token has no readable exp", () => {
    expect(sessionCookieOptions({ token: "opaque-token", email: "a@x" })).not.toHaveProperty("expires");
  });

  it("keeps the attributes the middleware's delete has to match", () => {
    const opts = sessionCookieOptions({ token: "opaque-token", email: "a@x" });
    expect(opts).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  });
});
