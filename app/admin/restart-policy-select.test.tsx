import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import RestartPolicySelect from "./restart-policy-select";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.restartPolicy;
const noop = () => {};

describe("RestartPolicySelect", () => {
  // The regression this file exists for: the modes were <button aria-pressed>
  // labelled like commands, an admin clicked "Restart now" and reported that
  // nothing restarted. They are a choice that rides along with the next save, so
  // they have to carry radio semantics and say so in words.
  it("is a radiogroup, not a row of action buttons", () => {
    const html = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "now" }} onChange={noop} />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).not.toContain("aria-pressed");
  });

  it("marks exactly one option as chosen", () => {
    const html = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "notice" }} onChange={noop} />,
    );
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(2);
  });

  // The "this is a choice, not a button" line lived here while the section had no
  // verb at all. It now sits in RestartNoticeBlock, next to the button it points
  // at — see restart-notice.test.tsx. What this group must still not do is offer
  // anything that looks like it acts on its own.
  it("offers no action of its own", () => {
    const html = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "now" }} onChange={noop} />,
    );
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).not.toMatch(/<button(?![^>]*role="radio")/);
  });

  it("labels the modes as answers to the heading rather than as commands", () => {
    const html = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "now" }} onChange={noop} />,
    );
    expect(html).toContain(t.heading);
    for (const label of [t.now, t.notice, t.schedule]) {
      expect(html).toContain(label);
    }
    // The old imperative wording must not come back by copy-paste.
    expect(html).not.toContain("Restart now");
  });

  it("asks for the time only when the schedule mode is chosen, and rejects a past one", () => {
    const withoutPicker = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "now" }} onChange={noop} />,
    );
    expect(withoutPicker).not.toContain('type="datetime-local"');

    const past = renderToStaticMarkup(
      <RestartPolicySelect policy={{ mode: "schedule", at: "2020-01-01T00:00" }} onChange={noop} />,
    );
    expect(past).toContain('type="datetime-local"');
    expect(past).toContain(t.atInvalid);
  });
});
