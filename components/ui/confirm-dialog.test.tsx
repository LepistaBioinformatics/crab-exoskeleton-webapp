import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

const noop = () => {};

describe("ConfirmDialog", () => {
  // Load-bearing, not trivia: the dialog portals to <body>, which server
  // rendering cannot do. Returning null before reaching createPortal is what
  // lets every component that mounts a closed dialog be rendered in this
  // suite's `environment: "node"` at all.
  it("renders nothing, and reaches no portal, while closed", () => {
    expect(
      renderToStaticMarkup(
        <ConfirmDialog open={false} title="Delete?" onConfirm={noop} onCancel={noop} />,
      ),
    ).toBe("");
  });
});
