// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ConversationSearchBar from "./conversation-search-bar";
import { chatCopy } from "@/lib/i18n/chat";

// Who gets the cursor when the filter mounts.
//
// The bar takes focus in the SIDEBAR because it exists there only while the magnifier is
// on — mounting is the member asking. On the landing it is part of the screen whether or
// not they came to filter, and taking focus there raised the soft keyboard over the
// new-chat screen on arrival and raced the composer for the cursor on a desktop.

const t = chatCopy.en.search;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
});

function mount(props: { autoFocus?: boolean }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  act(() => {
    root.render(
      <ConversationSearchBar value="" onChange={() => {}} conversations={[]} {...props} />,
    );
  });
  const input = host.querySelector<HTMLInputElement>(
    `input[placeholder="${t.placeholder}"]`,
  );
  if (!input) throw new Error("the filter field is not on screen");
  return input;
}

describe("the conversation filter's cursor", () => {
  it("stays where it was unless the caller says mounting was a request", () => {
    const input = mount({});
    expect(document.activeElement).not.toBe(input);
  });

  it("takes the cursor where mounting IS the request", () => {
    const input = mount({ autoFocus: true });
    expect(document.activeElement).toBe(input);
  });
});
