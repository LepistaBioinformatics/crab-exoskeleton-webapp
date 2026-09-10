// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The admin side of "my scheduled tasks never run". The member sees a notice on
// their own panel; this is where one instance is switched without moving the
// whole agent -- and paying for a container per member that never stops.

// LocaleProvider calls useRouter to re-run the server layout on a locale change.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const readInstanceMode = vi.fn();
const writeInstanceMode = vi.fn();
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return {
    ...actual,
    readInstanceMode: (...a: unknown[]) => readInstanceMode(...a),
    writeInstanceMode: (...a: unknown[]) => writeInstanceMode(...a),
  };
});

import InstanceModeControl from "./instance-mode-control";
import { LocaleProvider } from "@/lib/i18n/context";

const instance = { tenantId: "t", subsAccId: "s", userAccId: "u", agent: "gamma" };

const scaleToZero = {
  effective: "scale-to-zero",
  override: "",
  agentDefault: "scale-to-zero",
  scaleToZeroAllowed: true,
  fires: false,
};

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
  readInstanceMode.mockReset();
  writeInstanceMode.mockReset();
});

async function mount(view: unknown) {
  readInstanceMode.mockResolvedValue(view);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LocaleProvider initialLocale="en">
        <InstanceModeControl instance={instance} />
      </LocaleProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

describe("the per-instance lifecycle control", () => {
  // The consequence, not the setting: an admin arrives here from a report about
  // tasks, so the row has to say what the mode does to them.
  it("says the scheduled tasks are inert when the instance shuts down", async () => {
    const el = await mount(scaleToZero);
    expect(el.textContent).toContain("Scheduled tasks inert");
    expect(el.textContent).toContain("Schedules fire from timers inside the container");
  });

  it("says nothing about inert tasks when the instance is always on", async () => {
    const el = await mount({ ...scaleToZero, effective: "continuous", fires: true });
    expect(el.textContent).toContain("Scheduled tasks run");
    expect(el.textContent).not.toContain("Schedules fire from timers inside the container");
  });

  // "" is a real, selectable choice -- follow the agent -- not a null state.
  // Without it an admin who pinned a value could never hand the instance back.
  it("selects 'follow the agent' when nothing is pinned, and names the default", async () => {
    const el = await mount(scaleToZero);
    const select = el.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0].textContent).toContain("Shuts down when idle");
  });

  it("selects the pinned value when there is one", async () => {
    const el = await mount({ ...scaleToZero, override: "continuous", effective: "continuous", fires: true });
    expect((el.querySelector("select") as HTMLSelectElement).value).toBe("continuous");
  });

  // An agent with no idleTimeout cannot represent scale-to-zero, so the option
  // is absent rather than offered and then refused by the write.
  it("hides scale-to-zero when the agent cannot represent it", async () => {
    const el = await mount({
      effective: "continuous",
      override: "",
      agentDefault: "continuous",
      scaleToZeroAllowed: false,
      fires: true,
    });
    const values = Array.from((el.querySelector("select") as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(values).not.toContain("scale-to-zero");
    expect(values).toContain("continuous");
  });

  // The response REPLACES the view. Merging would need a second copy of the
  // proxy's precedence rule here, and a clear changes effective, override and
  // fires together.
  it("takes the whole fresh view from the write", async () => {
    const el = await mount(scaleToZero);
    writeInstanceMode.mockResolvedValue({
      effective: "continuous",
      override: "continuous",
      agentDefault: "scale-to-zero",
      scaleToZeroAllowed: true,
      fires: true,
    });

    const select = el.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "continuous";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeInstanceMode).toHaveBeenCalledWith(instance, "continuous");
    expect(el.textContent).toContain("Scheduled tasks run");
    expect(el.textContent).not.toContain("Schedules fire from timers inside the container");
  });
});
