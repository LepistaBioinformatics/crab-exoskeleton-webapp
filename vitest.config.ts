import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // Globs, not bare names: "node_modules" only matched the one at the root, so
    // a git worktree checked out under .claude/worktrees/ brought its own
    // node_modules into the run and third-party .test.ts files inside it failed
    // to collect. The suite's own files are excluded there too — a worktree is
    // another branch's checkout, and running its tests from this one reports on
    // code that is not in this tree.
    exclude: ["**/node_modules/**", ".next", ".claude/**"],
  },
});
