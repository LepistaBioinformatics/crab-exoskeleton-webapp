// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The member's report: scheduled tasks were listed, looked healthy, and never
// ran. They fire from timers inside the container, and a scale-to-zero instance
// is stopped most of the time -- so the list was true and the conclusion drawn
// from it was not.
//
// The proxy has reported `fires` for a while; nothing read it.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const listTasks = vi.fn();
vi.mock("@/lib/cronTasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cronTasks")>();
  return { ...actual, listTasks: (...args: unknown[]) => listTasks(...args) };
});

import ScheduledTasksPanel from "./scheduled-tasks-panel";
import { LocaleProvider } from "@/lib/i18n/context";
import type { Workspace } from "./fragment";

const workspace = { agent: "gamma" } as unknown as Workspace;

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
  listTasks.mockReset();
});

async function render(fires: boolean | undefined) {
  listTasks.mockResolvedValue({ tasks: [], orphans: [], ...(fires === undefined ? {} : { fires }) });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LocaleProvider initialLocale="en">
        <ScheduledTasksPanel workspace={workspace} onReference={() => {}} />
      </LocaleProvider>,
    );
  });
  // Let the fetch effect settle.
  await act(async () => {
    await Promise.resolve();
  });
  return host.textContent ?? "";
}

describe("the inert-schedule notice", () => {
  it("warns when the proxy says the schedules do not fire", async () => {
    const text = await render(false);
    expect(text).toContain("These tasks are not running");
  });

  it("says nothing when they do fire", async () => {
    const text = await render(true);
    expect(text).not.toContain("These tasks are not running");
  });

  // The case that decides the field is optional rather than required. A proxy
  // older than `fires` sends no field, and treating the absent value as `false`
  // would warn every member of an older deployment about a problem they do not
  // have.
  it("says nothing when the proxy does not report the field at all", async () => {
    const text = await render(undefined);
    expect(text).not.toContain("These tasks are not running");
  });
});
