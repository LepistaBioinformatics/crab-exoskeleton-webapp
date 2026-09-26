// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";
import type { MemberSkill, SkillFile } from "@/lib/skills";

// FR-4b and FR-4c: the way back, and a skill read as the DIRECTORY it is.
//
// The panel's first version showed a `files` badge and stopped there -- the member was
// told templates and scripts existed and could never open one -- and it invented its
// own way back to the list while the files tab, in the same pane, already had one.

const listSkills = vi.fn();
const listSkillFiles = vi.fn();
const readSkill = vi.fn();
const saveSkill = vi.fn();

vi.mock("@/lib/skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/skills")>();
  return {
    ...actual,
    listSkills: (...args: unknown[]) => listSkills(...args),
    listSkillFiles: (...args: unknown[]) => listSkillFiles(...args),
    readSkill: (...args: unknown[]) => readSkill(...args),
    saveSkill: (...args: unknown[]) => saveSkill(...args),
  };
});

const SkillsPanel = (await import("./skills-panel")).default;

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const DOC = `---
name: writing-style
description: How to write.
---

Body.`;

function file(path: string, modifiedAt = "v1", extra: Partial<SkillFile> = {}): SkillFile {
  return { path, size: 12, modifiedAt, ...extra };
}

function skill(over: Partial<MemberSkill> = {}): MemberSkill {
  return {
    name: "writing-style",
    description: "How to write.",
    size: 120,
    modifiedAt: "v1",
    hasFiles: true,
    origin: "member",
    ...over,
  };
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

beforeEach(() => {
  listSkills.mockResolvedValue([skill()]);
  // As `listSkillFiles` delivers it: the skill first, then the rest. That ordering
  // is the client's own and is pinned in `lib/skills.test.ts`, over the helper that
  // does it -- which this file replaces with a mock.
  listSkillFiles.mockResolvedValue({
    files: [file("SKILL.md", "v1"), file("run.sh"), file("templates/brief.md", "v9")],
    origin: "member",
  });
  readSkill.mockImplementation(async (_ws: Workspace, name: string, path?: string) => ({
    name,
    path: path ?? "SKILL.md",
    content: path && path !== "SKILL.md" ? "A template, with no --- block.\n" : DOC,
    file: file(path ?? "SKILL.md", path === "templates/brief.md" ? "v9" : "v1"),
    origin: "member",
  }));
  saveSkill.mockImplementation(async (_ws: Workspace, input: { path?: string }) =>
    file(input.path ?? "SKILL.md", "v10"),
  );
});

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  vi.clearAllMocks();
});

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<SkillsPanel workspace={workspace} />);
  });
  return host;
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`no control labelled "${label}"`);
  return found;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

/** Open the one skill in the listing. */
async function openSkill(host: HTMLElement) {
  await click(button(host, `${t.skills.openPrefix} writing-style`));
}

// THE SAME CONTROL, NOT A SIMILAR ONE (FR-4b).
//
// Read out of `files-screen.tsx` rather than written down here, so the two cannot
// drift apart silently: if the files tab restyles its way back, this fails and the
// skills panel follows it. Two panels in the same pane returning to their own list
// differently is the kind of difference a member reads as meaning something.
describe("the way back to the list", () => {
  function backRow(source: string) {
    const at = source.indexOf("items-center gap-2 pb-3");
    const row = source.slice(at, at + 900);
    return {
      linkButton: /<Button\s+size="link"\s+variant="link"/.test(row),
      chevron: row.match(/<ChevronLeft size=\{(\d+)\} aria-hidden \/>/)?.[1],
      openItem: row.match(/className="(min-w-0 [^"]*)"/)?.[1],
    };
  }

  it("is the files tab's control, down to the icon and the classes", () => {
    const files = backRow(readFileSync(resolve(__dirname, "files-screen.tsx"), "utf8"));
    const skills = backRow(readFileSync(resolve(__dirname, "skills-panel.tsx"), "utf8"));
    expect(files.linkButton, "files-screen no longer matches the shape this pins").toBe(true);
    expect(files.chevron).toBeDefined();
    expect(skills).toEqual(files);
  });

  // The files tab labels it with the DESTINATION -- "Files", its own name -- rather
  // than with a "back to…" phrase, and puts what is open beside it.
  it("names where it goes, with the open skill beside it", async () => {
    const host = await mount();
    await openSkill(host);
    const back = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === t.skills.title,
    );
    expect(back, "no control labelled with the list it returns to").toBeTruthy();
    expect(host.textContent).toContain("writing-style");

    await click(back!);
    expect(host.querySelector(`[aria-label="${t.skills.openPrefix} writing-style"]`)).toBeTruthy();
  });
});

// FR-4c. A skill is a directory, and the badge saying so was all the member ever got.
describe("the files inside a skill", () => {
  it("are all listed, the skill itself among them and subdirectories included", async () => {
    const host = await mount();
    await openSkill(host);
    const paths = [...host.querySelectorAll("li button")]
      .map((b) => b.getAttribute("aria-label"))
      .filter((l): l is string => !!l?.startsWith(`${t.skills.openPrefix} `))
      .map((l) => l.slice(t.skills.openPrefix.length + 1));
    expect(paths).toEqual(["SKILL.md", "run.sh", "templates/brief.md"]);
  });

  // A LISTING THAT FAILS MUST NOT TAKE THE SKILL DOWN WITH IT. The gateway needs its
  // own block for /v1/skills/files, and this stack has shipped a missing one three
  // times; the skill is readable without the index.
  it("do not stop the skill being read when the listing fails", async () => {
    listSkillFiles.mockRejectedValue(new Error("connectivity"));
    const host = await mount();
    await openSkill(host);
    expect(host.textContent).toContain("Body.");
  });

  it("open in place, addressed by their path", async () => {
    const host = await mount();
    await openSkill(host);
    await click(button(host, `${t.skills.openPrefix} templates/brief.md`));
    expect(readSkill).toHaveBeenLastCalledWith(workspace, "writing-style", "templates/brief.md");
    expect(host.textContent).toContain("A template, with no --- block.");
  });

  // Read-only layers are browsable for the same reason they are listed at all: an
  // administrator's skill that tells the agent to fill in a template cannot be
  // understood while the template is invisible. What they lack is the editor.
  it("are browsable on a layer the member cannot write", async () => {
    listSkills.mockResolvedValue([skill({ origin: "shared" })]);
    listSkillFiles.mockResolvedValue({
      files: [file("SKILL.md"), file("templates/brief.md")],
      origin: "shared",
    });
    readSkill.mockImplementation(async (_ws: Workspace, name: string, path?: string) => ({
      name,
      path: path ?? "SKILL.md",
      content: DOC,
      file: file(path ?? "SKILL.md"),
      origin: "shared",
    }));
    const host = await mount();
    await openSkill(host);
    expect(button(host, `${t.skills.openPrefix} templates/brief.md`)).toBeTruthy();
    expect(host.textContent).toContain(t.skills.readOnly);
    expect(host.querySelector(`[aria-label^="${t.skills.editPrefix}"]`)).toBeNull();
  });
});

// The load-bearing one. A supporting file has its own version and its own path, and
// getting either wrong writes the member's template over their skill -- or is refused
// upstream as a SKILL.md with no frontmatter.
describe("editing a supporting file", () => {
  async function openTemplate(): Promise<HTMLElement> {
    const host = await mount();
    await openSkill(host);
    await click(button(host, `${t.skills.openPrefix} templates/brief.md`));
    await click(button(host, `${t.skills.editPrefix} templates/brief.md`));
    return host;
  }

  it("saves it under its own path and its own version", async () => {
    const host = await openTemplate();
    const save = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Save",
    );
    // NOT DISABLED, though the body carries no frontmatter at all. Only SKILL.md is
    // held to that grammar (backend FR-5); a template validated against it could
    // never be saved.
    expect(save?.disabled).toBe(false);
    await click(save!);
    expect(saveSkill).toHaveBeenCalledWith(workspace, {
      name: "writing-style",
      path: "templates/brief.md",
      content: "A template, with no --- block.\n",
      // v9, THIS FILE's version -- not v1, which is the skill's. Sending the skill's
      // would be a 409 the member did nothing to earn, or worse, none at all.
      modifiedAt: "v9",
    });
  });

  it("is not previewed as markdown, and carries no name field", async () => {
    const host = await openTemplate();
    expect(host.textContent).toContain(t.skills.supportingFile);
    expect(host.textContent).not.toContain(t.skills.nameLabel);
    expect(host.querySelector(`[aria-label="${t.skills.showPreview}"]`)).toBeNull();
    expect(host.querySelector(`[aria-label="${t.skills.hidePreview}"]`)).toBeNull();
  });
});

// The other load-bearing one. `binary` means the proxy withheld the bytes rather than
// send a lossy decoding of them, so an editor here would save an empty file over a
// PNG and report it as a success.
describe("a file that is not text", () => {
  beforeEach(() => {
    listSkillFiles.mockResolvedValue({
      files: [file("SKILL.md"), file("assets/logo.png", "v2")],
      origin: "member",
    });
    readSkill.mockImplementation(async (_ws: Workspace, name: string, path?: string) => ({
      name,
      path: path ?? "SKILL.md",
      content: path === "assets/logo.png" ? "" : DOC,
      file:
        path === "assets/logo.png"
          ? file("assets/logo.png", "v2", { size: 4096, binary: true })
          : file("SKILL.md"),
      origin: "member",
    }));
  });

  it("is shown with its size and no way to edit it", async () => {
    const host = await mount();
    await openSkill(host);
    await click(button(host, `${t.skills.openPrefix} assets/logo.png`));
    expect(host.textContent).toContain(t.skills.binary);
    expect(host.textContent).toContain("assets/logo.png");
    expect(
      host.querySelector(`[aria-label="${t.skills.editPrefix} assets/logo.png"]`),
      "a binary file offers an editor",
    ).toBeNull();
    expect(host.querySelector("textarea"), "a textarea over bytes that were withheld").toBeNull();
  });

  // THE PATH THAT HAS NOTHING TO DO WITH THE PENCIL. A 409 means the agent's own
  // evolution rewrote this file while the member had it open, and what it wrote is
  // not bound to still be text -- so the re-read that answers the conflict is a third
  // way into the editor, and the only one where the file changed KIND underneath.
  it("closes the editor when the re-read after a conflict finds bytes", async () => {
    let reads = 0;
    readSkill.mockImplementation(async (_ws: Workspace, name: string, path?: string) => {
      reads += 1;
      const replaced = reads > 1;
      return {
        name,
        path: path ?? "SKILL.md",
        content: replaced ? "" : DOC,
        file: replaced
          ? file("SKILL.md", "v2", { size: 4096, binary: true })
          : file("SKILL.md"),
        origin: "member",
      };
    });
    saveSkill.mockRejectedValue(new Error("skill_changed"));

    const host = await mount();
    await click(button(host, `${t.skills.editPrefix} writing-style`));
    expect(host.querySelector("textarea")).toBeTruthy();

    const save = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Save");
    await click(save!);
    const reload = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === t.skills.conflictReload,
    );
    expect(reload, "a 409 offered no way to re-read").toBeTruthy();

    await click(reload!);
    expect(host.querySelector("textarea"), "a textarea survived the file becoming binary").toBeNull();
    expect(host.textContent).toContain(t.skills.binary);
  });
});
