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

vi.mock("@/lib/mycelium", () => ({
  fetchMycelium: (...args: unknown[]) => fetchMycelium(...args),
  isInstance: (v: unknown) => v === "alpha" || v === "beta",
  MyceliumConnectivityError: class extends Error {},
  upstreamError: async () => ({ error: "upstream", status: 500 }),
}));

const { POST, DELETE } = await import("./route");
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
