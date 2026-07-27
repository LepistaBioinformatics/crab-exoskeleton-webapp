import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import RestartNoticeBlock from "./restart-notice";
import { adminCopy } from "@/lib/i18n/admin";
import type { RestartPolicy } from "@/lib/restartPolicy";

const t = adminCopy.en.restartPolicy;
const target = { tenantId: "t1", subsAccId: "s1" };

// The suite runs in `environment: "node"` with no DOM, so effects never fire:
// what these assert is the first paint, before the notice has been read. The
// fetch-dependent states are covered by the pure helpers in
// lib/adminRestart.test.ts, which is where the contract with the BFF lives.
function render(policy: RestartPolicy) {
  return renderToStaticMarkup(
    <RestartNoticeBlock target={target} policy={policy} scopeLabel="Biotrop" />,
  );
}

describe("RestartNoticeBlock", () => {
  // The verb an admin was looking for when they clicked a mode and nothing
  // happened. One button, and it follows the mode chosen above so the section
  // never carries two competing notions of delivery.
  it("labels the action after the mode chosen above", () => {
    expect(render({ mode: "now" })).toContain(t.actNow);
    expect(render({ mode: "notice" })).toContain(t.actNotice);
    expect(render({ mode: "schedule", at: "2030-01-02T03:04" })).toContain(t.actSchedule);
  });

  it("explains that the mode rides along with saves, and that the button acts now", () => {
    expect(render({ mode: "now" })).toContain(t.ridesAlong);
  });

  it("reads the scope before claiming anything about it", () => {
    const html = render({ mode: "now" });
    expect(html).toContain(t.pendingReading);
    expect(html).not.toContain("Nothing armed");
  });

  // The proxy reads ONE slot — this scope plus this agent — and never the
  // cascade, so an unqualified "nothing pending" would be the same false
  // reassurance the whole section exists to remove.
  it("names the slot it read when it reports nothing armed", () => {
    expect(t.pendingNone).toContain("{scope}");
    expect(t.pendingNone).toContain("{agent}");
    expect(adminCopy.pt.restartPolicy.pendingNone).toContain("{scope}");
    expect(adminCopy.pt.restartPolicy.pendingNone).toContain("{agent}");
  });

  // Withdraw is the undo for notify and schedule. Offering it with nothing armed
  // would promise an action the proxy has nothing to perform.
  it("offers no withdraw until a notice is known to exist", () => {
    expect(render({ mode: "now" })).not.toContain(t.withdraw);
  });

  // A schedule with no time is a 400 at the proxy; the same rule that hides the
  // panels blocks the button.
  it("blocks the action while the schedule is incomplete", () => {
    const html = render({ mode: "schedule" });
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("keeps the confirmation closed until the admin asks for an immediate bounce", () => {
    // ConfirmDialog portals to <body>, which server rendering cannot do — it
    // returning null while closed is what makes this component renderable at all.
    expect(render({ mode: "now" })).not.toContain(t.confirmTitle);
  });
});
