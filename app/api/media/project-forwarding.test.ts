import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The three media routes that do NOT go through `proxyRead` / `proxyMediaWrite`, and
// therefore have to forward `project` by hand. All three had forgotten to, so inside a
// project an upload wrote to the agent's own workspace and a delete or download read
// from it.
//
// This is the first test in the repo over a BFF route handler, and it exists because
// the defect it covers is invisible to every other kind: the client sent the parameter,
// the proxy understood it, and the layer in between silently dropped it.

const fetchMycelium = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ token: "tok" }),
  clearSession: async () => {},
}));

// `mediaError` is deliberately NOT stubbed: the status→code mapping is the thing
// under test below, and a fake would only prove the fake.
vi.mock("@/lib/mycelium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mycelium")>();
  return {
    ...actual,
    fetchMycelium: (...args: unknown[]) => fetchMycelium(...args),
    isInstance: (v: unknown) => v === "alpha" || v === "beta",
    MyceliumConnectivityError: class extends Error {},
    upstreamError: async () => ({ error: "upstream", status: 500 }),
  };
});

const { POST, DELETE } = await import("./route");
const { POST: MOVE } = await import("./move/route");
const { GET: DOWNLOAD } = await import("./download/route");

const QUERY = "role=alpha&tenant_id=t1&subs_acc_id=s1&path=uploads/x.zip";

/** The path fetchMycelium was called with, after the handler ran. */
function calledPath(): string {
  return fetchMycelium.mock.calls[0][0] as string;
}

beforeEach(() => {
  fetchMycelium.mockReset();
  fetchMycelium.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: null,
    json: async () => ({ path: "uploads/x.zip", name: "x.zip", size: 3 }),
  });
});

function uploadRequest(project?: string): NextRequest {
  const form = new FormData();
  form.set("role", "alpha");
  form.set("tenant_id", "t1");
  form.set("subs_acc_id", "s1");
  if (project !== undefined) form.set("project", project);
  form.set("file", new File(["abc"], "x.zip"));
  return new NextRequest("http://app/api/media", { method: "POST", body: form });
}

describe("POST /api/media", () => {
  // The body is REBUILT rather than piped, so a field this route does not name is a
  // field the proxy never sees — even when the browser sent it.
  it("forwards the project on the upstream multipart body", async () => {
    await POST(uploadRequest("seedtrial"));
    const body = fetchMycelium.mock.calls[0][1].body as FormData;
    expect(body.get("project")).toBe("seedtrial");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("omits it outside a project", async () => {
    await POST(uploadRequest());
    const body = fetchMycelium.mock.calls[0][1].body as FormData;
    expect(body.has("project")).toBe(false);
  });

  // A field present but empty would reach the proxy as an unknown project id and 404
  // every upload made outside a project.
  it("omits it rather than forwarding an empty value", async () => {
    await POST(uploadRequest(""));
    const body = fetchMycelium.mock.calls[0][1].body as FormData;
    expect(body.has("project")).toBe(false);
  });
});

describe("DELETE /api/media", () => {
  it("forwards the project", async () => {
    await DELETE(new NextRequest(`http://app/api/media?${QUERY}&project=seedtrial`, { method: "DELETE" }));
    expect(calledPath()).toContain("project=seedtrial");
  });

  it("omits it outside a project", async () => {
    await DELETE(new NextRequest(`http://app/api/media?${QUERY}`, { method: "DELETE" }));
    expect(calledPath()).not.toContain("project=");
  });
});

describe("GET /api/media/download", () => {
  it("forwards the project", async () => {
    await DOWNLOAD(new NextRequest(`http://app/api/media/download?${QUERY}&project=seedtrial`));
    expect(calledPath()).toContain("project=seedtrial");
  });

  it("omits it outside a project", async () => {
    await DOWNLOAD(new NextRequest(`http://app/api/media/download?${QUERY}`));
    expect(calledPath()).not.toContain("project=");
  });
});

// A refused upload has to arrive as a CODE. The proxy answers with an English
// sentence, and forwarding that sentence is what made "file exceeds the
// 10485760-byte limit" reach the member as "Algo deu errado." — the client's
// dictionary is keyed by code, and an unrecognised string falls through to
// `unknown`.
describe("media failures map to translatable codes", () => {
  const cases: Array<[number, string]> = [
    [413, "too_large"],
    [403, "forbidden"],
    [404, "not_found"],
    [400, "invalid_request"],
    [500, "unknown"],
  ];

  for (const [status, code] of cases) {
    it(`turns ${status} into ${code}`, async () => {
      fetchMycelium.mockResolvedValue({
        ok: false,
        status,
        headers: new Headers(),
        json: async () => ({ error: { message: "file exceeds the 10485760-byte limit" } }),
        text: async () => "file exceeds the 10485760-byte limit",
      });

      const res = await POST(uploadRequest());
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
    });
  }

  // The move route matters as much as the upload now: an external drop onto a
  // folder is an upload FOLLOWED BY A MOVE, so this is a failure a member reaches
  // by dragging a file in — not an admin-only path.
  it("maps the move route's failures too", async () => {
    fetchMycelium.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      json: async () => ({ error: { message: "destination exists" } }),
      text: async () => "destination exists",
    });

    const req = new NextRequest("http://app/api/media/move", {
      method: "POST",
      body: JSON.stringify({
        role: "alpha",
        tenant_id: "t1",
        subs_acc_id: "s1",
        path: "q1.pdf",
        to: "reports/q1.pdf",
      }),
    });
    const res = await MOVE(req);
    expect((await res.json()).error).toBe("media_name_taken");
  });
});
