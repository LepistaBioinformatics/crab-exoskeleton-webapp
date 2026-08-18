import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import MembersPanel from "./members-panel";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.members;

// The suite runs in `environment: "node"` with no DOM, so effects never fire: this is
// the first paint. That is exactly the state under test -- the tenant branch returns
// before any fetch is reached, which is what makes it assertable here at all.
function render(scope: Parameters<typeof MembersPanel>[0]["scope"]) {
  return renderToStaticMarkup(
    <MembersPanel
      scope={scope}
      agent="alpha"
      tenantLabel="Acme"
      scopeLabel="Growth"
      onPickSubscription={() => {}}
    />,
  );
}

describe("MembersPanel — a tenant scope", () => {
  // A DELIBERATE EXCEPTION to this screen's rule that a section a target cannot use is
  // absent. An admin who administers tenants and never sees a Members entry cannot learn
  // that member management exists one level down. See the feature's context.md, DEC-3 --
  // and do not "fix" this into an absence.
  it("explains that a roster belongs to a subscription", () => {
    const html = render({ kind: "tenant", tenantId: "t1" });
    expect(html).toContain(t.tenantSelected);
    expect(html).toContain(t.tenantSelectedBody);
  });

  it("goes through the shared empty-state primitive rather than look-alike markup", () => {
    expect(render({ kind: "tenant", tenantId: "t1" })).toContain("data-empty-state");
  });

  // A dead end would be a worse answer than an absent section: the state names what it
  // needs AND offers the way to get there.
  it("offers the way to select one", () => {
    expect(render({ kind: "tenant", tenantId: "t1" })).toContain(t.pickSubscription);
  });

  // A subscription-kind scope with no account id cannot address a roster either, and
  // takes the same branch rather than falling through to a list call with `undefined`.
  it("treats a subscription with no account id the same way", () => {
    expect(render({ kind: "subscription", tenantId: "t1" })).toContain(t.tenantSelected);
  });

  it("does not take that branch for a real subscription", () => {
    const html = render({ kind: "subscription", tenantId: "t1", subsAccId: "s1" });
    expect(html).not.toContain(t.tenantSelected);
    // A fragment without an apostrophe: renderToStaticMarkup escapes `'` to `&#x27;`,
    // so the copy string does not appear verbatim in the output.
    expect(html).toContain("never open or edit their contents");
  });
});
