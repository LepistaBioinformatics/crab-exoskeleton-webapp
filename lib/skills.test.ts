import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SKILL_ORIGINS,
  deleteSkill,
  listSkillFiles,
  listSkills,
  orderSkillFiles,
  readSkill,
  saveSkill,
  seedSkill,
  skillProblem,
  type SkillFile,
} from "./skills";
import type { Workspace } from "@/app/chat/fragment";

// A workspace that IS inside a project, on every request below. A fixture without
// `p` would pass against a client that forwards it, so the assertion this file
// exists for would prove nothing.
const workspace: Workspace = { t: "t1", s: "s1", r: "alpha", p: "legal" };

type Call = { url: string; init?: RequestInit };

function captureFetch(response: unknown = {}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => response } as unknown as Response;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// THE INVARIANT THIS MODULE EXISTS TO HOLD (spec DEC-1).
//
// `workspaceQuery` — which this client is built on, so that tenant, subscription and
// role keep one spelling across every panel — spreads `project` whenever the view is
// inside one. Skills must not carry it: the harness's loader is fixed on the main
// workspace at boot, so a project-scoped skill is a file nothing ever reads. The
// member would be told their skill was saved and their agent would not change.
//
// Asserted over all four calls rather than over the one that writes, because the
// parameter is added by a shared helper and a read that carried it would answer from
// the wrong directory just as silently.
describe("no member-skills call addresses a project", () => {
  it("leaves it out of the listing", async () => {
    const calls = captureFetch({ skills: [] });
    await listSkills(workspace);
    expect(calls[0].url).not.toContain("project");
    expect(calls[0].url).toContain("tenant_id=t1");
    expect(calls[0].url).toContain("role=alpha");
  });

  it("leaves it out of a document read", async () => {
    const calls = captureFetch({ name: "n", path: "SKILL.md", content: "", file: {} });
    await readSkill(workspace, "writing-style");
    expect(calls[0].url).not.toContain("project");
    expect(calls[0].url).toContain("name=writing-style");
  });

  it("leaves it out of a file listing", async () => {
    const calls = captureFetch({ files: [], origin: "member" });
    await listSkillFiles(workspace, "writing-style");
    expect(calls[0].url).not.toContain("project");
    expect(calls[0].url).toContain("/api/skills/files");
    expect(calls[0].url).toContain("name=writing-style");
  });

  it("leaves it out of a write, where it would store an inert file", async () => {
    const calls = captureFetch({ status: "ok", name: "n", file: {} });
    await saveSkill(workspace, { name: "n", content: "x" });
    expect(calls[0].url).not.toContain("project");
    expect(String(calls[0].init?.body)).not.toContain("project");
  });

  it("leaves it out of a delete", async () => {
    const calls = captureFetch({ status: "deleted", name: "n" });
    await deleteSkill(workspace, "n");
    expect(calls[0].url).not.toContain("project");
  });
});

// A SKILL IS A DIRECTORY, and `path` is which file of it (FR-4c). Left out entirely
// when the caller names none, so the proxy applies its own SKILL.md default and the
// request stays the one this client made before supporting files existed -- and sent
// whenever there IS one, because a read or a write that dropped it would answer about,
// or overwrite, the skill itself.
describe("which file of the skill", () => {
  it("is left to the proxy's default when the caller names none", async () => {
    const calls = captureFetch({ name: "n", path: "SKILL.md", content: "", file: {} });
    await readSkill(workspace, "writing-style");
    expect(calls[0].url).not.toContain("path=");
  });

  it("travels on a read that names one", async () => {
    const calls = captureFetch({ name: "n", path: "templates/brief.md", content: "", file: {} });
    await readSkill(workspace, "writing-style", "templates/brief.md");
    expect(calls[0].url).toContain("path=templates%2Fbrief.md");
  });

  it("travels on a write that names one", async () => {
    const calls = captureFetch({ status: "ok", name: "n", file: {} });
    await saveSkill(workspace, { name: "n", path: "templates/brief.md", content: "x" });
    expect(String(calls[0].init?.body)).toContain('"path":"templates/brief.md"');
  });

  it("is absent from a write that does not, rather than sent empty", async () => {
    const calls = captureFetch({ status: "ok", name: "n", file: {} });
    await saveSkill(workspace, { name: "n", content: "x" });
    expect(String(calls[0].init?.body)).not.toContain("path");
  });
});

// The skill itself first. The proxy walks a directory tree and answers in whatever
// order it reached the files, so the one file the member came to read would otherwise
// sit somewhere in the middle of a list of templates.
describe("the order files are listed in", () => {
  const file = (path: string): SkillFile => ({ path, size: 1, modifiedAt: "v1" });

  it("puts SKILL.md first however the server sent it", () => {
    const ordered = orderSkillFiles([
      file("templates/brief.md"),
      file("SKILL.md"),
      file("run.sh"),
    ]);
    expect(ordered.map((f) => f.path)).toEqual(["SKILL.md", "run.sh", "templates/brief.md"]);
  });

  it("sorts the listing the panel gets, not just a local array", async () => {
    captureFetch({ files: [file("run.sh"), file("SKILL.md")], origin: "member" });
    const { files } = await listSkillFiles(workspace, "writing-style");
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "run.sh"]);
  });
});

// `modifiedAt` is what tells the proxy a create from a save (backend DEC-7), so the
// two calls have to be distinguishable on the wire as well as in the panel.
describe("a conditional write", () => {
  it("sends no version at all when creating", async () => {
    const calls = captureFetch({ file: {} });
    await saveSkill(workspace, { name: "n", content: "x" });
    expect(String(calls[0].init?.body)).not.toContain("modifiedAt");
  });

  it("sends the version the member read when saving", async () => {
    const calls = captureFetch({ file: {} });
    await saveSkill(workspace, { name: "n", content: "x", modifiedAt: "2026-09-01T00:00:00Z" });
    expect(String(calls[0].init?.body)).toContain("2026-09-01T00:00:00Z");
  });

  // ONE STATUS, TWO THINGS TO SAY. The proxy answers a taken name and a stale
  // version with the same 409, and only the caller knows which of the two calls it
  // made — so telling them apart anywhere else would be a guess.
  it("reads a 409 on a create as a name that is taken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: "skill_conflict" }),
      })),
    );
    await expect(saveSkill(workspace, { name: "n", content: "x" })).rejects.toThrow(
      "skill_name_taken",
    );
  });

  it("reads a 409 on a save as the agent having rewritten it underneath", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: "skill_conflict" }),
      })),
    );
    await expect(
      saveSkill(workspace, { name: "n", content: "x", modifiedAt: "v1" }),
    ).rejects.toThrow("skill_changed");
  });

  it("passes every other refusal through as the code the route sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "skill_read_only" }),
      })),
    );
    await expect(saveSkill(workspace, { name: "n", content: "x" })).rejects.toThrow(
      "skill_read_only",
    );
  });

  // The stored version comes back so the editor can hold it. Without that, a second
  // save in the same sitting sends the version from the original read and earns a
  // 409 the member did nothing to cause. PER FILE: the proxy versions each file of a
  // skill on its own, so what comes back is the file that was written.
  it("returns the file the proxy stored", async () => {
    captureFetch({
      status: "ok",
      name: "n",
      path: "templates/brief.md",
      file: { path: "templates/brief.md", size: 1, modifiedAt: "v2" },
    });
    const file = await saveSkill(workspace, {
      name: "n",
      path: "templates/brief.md",
      content: "x",
    });
    expect(file.modifiedAt).toBe("v2");
    expect(file.path).toBe("templates/brief.md");
  });
});

// The member's own layer first, because it is the one they can act on; the
// administrator's and the operator's after it, as context (FR-2).
describe("the origins", () => {
  it("are the three the proxy sends, in the order the panel groups by", () => {
    expect(SKILL_ORIGINS).toEqual(["member", "shared", "managed"]);
  });
});

// A MIRROR OF `validateMemberSkillDoc`, so the member is told before a round trip.
// Every case below is one the proxy also refuses -- a rule only this side enforced
// would be a refusal the member could not explain and the server would have taken.
describe("what the proxy would refuse", () => {
  const good = "---\nname: writing-style\ndescription: How to write.\n---\n\nBody.\n";

  it("accepts a two-key document whose name agrees with the directory", () => {
    expect(skillProblem("writing-style", good)).toBeNull();
  });

  it("refuses a name outside the proxy's own pattern", () => {
    expect(skillProblem("Writing Style", good)).toBe("name");
    expect(skillProblem("-leading-dash", good)).toBe("name");
    expect(skillProblem("", good)).toBe("name");
    expect(skillProblem("x".repeat(65), good)).toBe("name");
  });

  it("accepts the edges of that pattern rather than being stricter than it", () => {
    expect(skillProblem("a", "---\nname: a\ndescription: d\n---\n")).toBeNull();
    expect(skillProblem("9._-", "---\nname: 9._-\ndescription: d\n---\n")).toBeNull();
  });

  // A document with no metadata block is one the harness skips entirely, so it is
  // not "a skill with an empty description" -- it is not a skill.
  it("refuses a document with no frontmatter at all", () => {
    expect(skillProblem("n", "Just a body.\n")).toBe("frontmatter");
    expect(skillProblem("n", "---\nname: n\ndescription: d\n")).toBe("frontmatter");
  });

  // AN EARLIER VERSION REFUSED A THIRD KEY, and it was wrong to. picoclaw SHIPS
  // skills carrying `metadata:` and `homepage:` -- seven of the nine in its own
  // workspace template -- so its loader plainly reads them, and the proxy's
  // `validateMemberSkillDoc` does not check for them either (backend FR-4). The rule
  // stopped a picoclaw member from saving any edit to the skills they were seeded
  // with, and every one of those writes would have been accepted upstream.
  it("accepts a third key, which the loader reads and the proxy allows", () => {
    expect(
      skillProblem("n", "---\nname: n\ndescription: d\nmetadata: {}\nhomepage: x\n---\n"),
    ).toBeNull();
  });

  // The Go reader cuts each line on the colon and SKIPS the line when there is none.
  // Refusing here would be a refusal the member could not explain and the server
  // would have taken.
  it("accepts a line with no key at all, as the Go reader does", () => {
    expect(skillProblem("n", "---\nname: n\ndescription: d\nnonsense\n---\n")).toBeNull();
  });

  it("refuses either value left blank", () => {
    expect(skillProblem("n", "---\nname: n\ndescription:\n---\n")).toBe("empty");
    expect(skillProblem("n", "---\nname:\ndescription: d\n---\n")).toBe("empty");
  });

  // A file in `foo/` declaring `name: skill-creator` shadows an operator skill,
  // because the harness dedups by the DECLARED name rather than by the directory.
  it("refuses a declared name that is not the skill's own", () => {
    expect(skillProblem("foo", "---\nname: skill-creator\ndescription: d\n---\n")).toBe(
      "mismatch",
    );
  });
});

// A new skill starts as the two keys the harness requires and nothing else -- minimal
// so the member writes a description rather than deleting a guess, not because a third
// key would be refused.
describe("the seed for a new skill", () => {
  it("carries the two keys, already agreeing with the name", () => {
    const seeded = seedSkill("writing-style");
    expect(seeded).toContain("name: writing-style");
    // Only the description is left to write, which is the one refusal a member
    // should meet on their own first save.
    expect(skillProblem("writing-style", seeded)).toBe("empty");
  });
});
