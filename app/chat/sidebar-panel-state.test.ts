import { describe, it, expect } from "vitest";
import { resolvePanel } from "./sidebar-panel-state";
import type { Workspace } from "./fragment";

const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

describe("resolvePanel", () => {
  it("shows the tree until a workspace is chosen", () => {
    expect(resolvePanel({ workspace: null, browsing: false })).toBe(
      "workspaces",
    );
  });

  it("shows that workspace's conversations once one is chosen", () => {
    expect(resolvePanel({ workspace, browsing: false })).toBe("chats");
  });

  // Back is a PANEL MOVE, not a deselection: the workspace is still in the fragment,
  // so the chat view on the right keeps rendering while the tree is shown for a new
  // pick. Nothing here clears `workspace`, and there is no writer that does.
  it("returns to the tree while browsing, with the workspace still selected", () => {
    expect(resolvePanel({ workspace, browsing: true })).toBe(
      "workspaces",
    );
  });
});
