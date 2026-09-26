import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// WHICH FILE OF THE SKILL, across the layer that can silently drop it.
//
// A skill is a directory, and `path` is what says whether the member is reading their
// SKILL.md or the template beside it. Both of these routes REBUILD the request they
// send upstream -- the query field by field on the reads, the JSON body field by field
// on the write, so a key nobody named here cannot be smuggled into a proxy call. That
// is the right shape and it has exactly one failure mode: a parameter nobody named is
// a parameter that vanishes, with both halves behaving perfectly.
//
// Dropped, every read answers with SKILL.md and every save of a template is validated
// upstream as one and refused. Neither the client nor the proxy could see it.
//
// In the idiom of `app/api/media/project-forwarding.test.ts`, which exists for the
// same defect: the client sent the parameter, the proxy understood it, and the layer
// in between said nothing.

const fetchMycelium = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ token: "tok" }),
  clearSession: async () => {},
}));

vi.mock("@/lib/mycelium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mycelium")>();
  return {
    ...actual,
    fetchMycelium: (...args: unknown[]) => fetchMycelium(...args),
    isInstance: (v: unknown) => v === "alpha" || v === "beta",
    MyceliumConnectivityError: class extends Error {},
  };
});

const { PUT } = await import("./route");
const { GET: DOC } = await import("./doc/route");
const { GET: FILES } = await import("./files/route");

const QUERY = "role=alpha&tenant_id=t1&subs_acc_id=s1&name=writing-style";

/** The upstream path the handler called, and the body it sent with it. */
function calledPath(): string {
  return fetchMycelium.mock.calls[0][0] as string;
}
function calledBody(): Record<string, unknown> {
  return JSON.parse(fetchMycelium.mock.calls[0][1].body as string);
}

beforeEach(() => {
  fetchMycelium.mockReset();
  fetchMycelium.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "ok" }),
  });
});

describe("GET /api/skills/doc", () => {
  it("forwards the file the caller asked for", async () => {
    await DOC(new NextRequest(`http://app/api/skills/doc?${QUERY}&path=templates/brief.md`));
    expect(calledPath()).toContain("path=templates%2Fbrief.md");
  });

  // Absent rather than empty: the proxy's own default is SKILL.md, and sending
  // `path=` would ask it to resolve a path with no segments at all.
  it("sends none when the caller named none, leaving the proxy its default", async () => {
    await DOC(new NextRequest(`http://app/api/skills/doc?${QUERY}`));
    expect(calledPath()).not.toContain("path=");
    expect(calledPath()).toContain("/alpha/v1/skills/doc");
  });
});

describe("GET /api/skills/files", () => {
  it("asks the proxy for the skill's own directory listing", async () => {
    await FILES(new NextRequest(`http://app/api/skills/files?${QUERY}`));
    expect(calledPath()).toContain("/alpha/v1/skills/files");
    expect(calledPath()).toContain("name=writing-style");
  });

  it("refuses a request that names no skill, rather than listing something else", async () => {
    const res = await FILES(
      new NextRequest("http://app/api/skills/files?role=alpha&tenant_id=t1&subs_acc_id=s1"),
    );
    expect(res.status).toBe(400);
    expect(fetchMycelium).not.toHaveBeenCalled();
  });
});

describe("PUT /api/skills", () => {
  function write(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://app/api/skills", {
      method: "PUT",
      body: JSON.stringify({
        role: "alpha",
        tenant_id: "t1",
        subs_acc_id: "s1",
        name: "writing-style",
        ...body,
      }),
    });
  }

  // THE ONE THAT WRITES THE WRONG FILE. Dropped here, a member's edit to a template
  // is stored as the skill itself -- or, more likely, refused, because the proxy
  // holds SKILL.md to a frontmatter grammar a template has no reason to satisfy.
  it("writes the file the caller named", async () => {
    await PUT(write({ path: "templates/brief.md", content: "Fill this in." }));
    expect(calledBody().path).toBe("templates/brief.md");
    expect(calledBody().content).toBe("Fill this in.");
  });

  it("omits it when the caller named none, leaving the proxy its default", async () => {
    await PUT(write({ content: "x" }));
    expect(calledBody()).not.toHaveProperty("path");
  });

  // Still rebuilt rather than piped: the routing input stays at this layer and a key
  // the route does not name never reaches the proxy.
  it("still sends nothing the route did not name", async () => {
    await PUT(write({ path: "run.sh", content: "x", restart: "now", role: "alpha" }));
    expect(calledBody()).not.toHaveProperty("restart");
    expect(calledBody()).not.toHaveProperty("role");
  });
});
