// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { Project } from "@/lib/projects";

// Two components read this list -- the projects screen and the shell, whose
// breadcrumb names the open project. The hook's doc comment has always said the
// list is "shared"; it is an ordinary hook with its own useState, so what has to
// be shared is the INVALIDATION, and it was not.
//
// The consequence was reported as a breadcrumb bug: create a project, get dropped
// into it, and the breadcrumb does not name it until the page is reloaded. The
// shell's copy is keyed on tenant|subscription|role, none of which a create
// changes, so nothing was ever going to re-read it.

let rows: Project[] = [];
const listed: unknown[] = [];

vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: async (workspace: unknown) => {
      listed.push(workspace);
      return rows;
    },
  };
});

import { useProjects } from "./use-projects";
import { createProject } from "@/lib/projects";

const WORKSPACE = { t: "t1", s: "s1", r: "alpha" };

// Two independent consumers, exactly as chat-shell and projects-screen are.
function Probe({ onRender }: { onRender: (ids: string[]) => void }) {
  const { projects } = useProjects(WORKSPACE);
  onRender(projects.map((p) => p.id));
  return null;
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  rows = [];
  listed.length = 0;
});

describe("useProjects, read by two components at once", () => {
  it("re-reads in EVERY copy when a project is created", async () => {
    rows = [];
    const shell: string[][] = [];
    const screen: string[][] = [];

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <>
          <Probe onRender={(ids) => shell.push(ids)} />
          <Probe onRender={(ids) => screen.push(ids)} />
        </>,
      );
    });

    expect(shell.at(-1)).toEqual([]);
    expect(screen.at(-1)).toEqual([]);

    // What the create returns is what the next listing holds. The write itself is
    // the real one from lib/projects, so the announcement under test is the one
    // production makes.
    rows = [{ id: "test-chat-n-o-inicia-com-projeto", name: "Test", instructions: "" } as Project];
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ project: { id: "test-chat-n-o-inicia-com-projeto", name: "Test" } }),
    }));

    await act(async () => {
      await createProject(WORKSPACE, "Test", "");
    });

    // BOTH, which is the whole point. Before the subscription existed only the
    // copy whose component called reload() saw it, and the breadcrumb is rendered
    // from the other one.
    expect(shell.at(-1)).toEqual(["test-chat-n-o-inicia-com-projeto"]);
    expect(screen.at(-1)).toEqual(["test-chat-n-o-inicia-com-projeto"]);
  });
});
