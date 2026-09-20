import { describe, it, expect } from "vitest";
import { taskFailed } from "./cronTasks";

describe("taskFailed", () => {
  it("reads the one value the scheduler writes for a bad run", () => {
    expect(taskFailed("error")).toBe(true);
    expect(taskFailed(" ERROR ")).toBe(true);
  });

  it("does not read a good run, or a value it does not know, as a failure", () => {
    expect(taskFailed("ok")).toBe(false);
    expect(taskFailed("something-new")).toBe(false);
  });

  // A task that has never run is not a broken one. Reading absence as failure
  // would paint every freshly created task red.
  it("is false when nothing has run yet", () => {
    expect(taskFailed(undefined)).toBe(false);
    expect(taskFailed("")).toBe(false);
  });

  // Substring matching would make "no-error" a failure. The store's values are
  // short and exact, so the comparison is too.
  it("matches exactly rather than by substring", () => {
    expect(taskFailed("no-error")).toBe(false);
    expect(taskFailed("errored")).toBe(false);
  });
});
