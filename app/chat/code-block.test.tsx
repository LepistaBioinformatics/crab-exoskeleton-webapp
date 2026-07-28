import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach } from "vitest";
import CodeBlock from "./code-block";
import { loadLanguage, __resetForTests } from "@/lib/code-highlight";

beforeEach(() => {
  __resetForTests();
});

// No portal and no effect that matters to the first paint, so this renders in the
// suite's `environment: "node"`. Effects never fire here, which is exactly right for
// the property under test: what a block looks like BEFORE its grammar has loaded,
// and that nothing unsafe reaches the markup on any path.
function render(props: { code: string; className?: string; streaming?: boolean }) {
  return renderToStaticMarkup(
    <CodeBlock code={props.code} className={props.className} streaming={props.streaming ?? false} />,
  );
}

describe("CodeBlock", () => {
  it("renders plain text while the grammar has not loaded", () => {
    const html = render({ code: "package main", className: "language-go" });
    expect(html).toContain("package main");
    expect(html).not.toContain("hljs-");
  });

  it("colours the block once the grammar is registered", async () => {
    await loadLanguage("go");
    const html = render({ code: 'func main() { println("hi") }', className: "language-go" });
    expect(html).toContain("hljs-");
  });

  it("renders plain while the reply is still being revealed", async () => {
    // The reveal re-renders the band up to 60 times and already re-parses the whole
    // markdown per step; highlighting there is work spent on text still arriving.
    await loadLanguage("go");
    const html = render({ code: "package main", className: "language-go", streaming: true });
    expect(html).toContain("package main");
    expect(html).not.toContain("hljs-");
  });

  it("renders plain for a language highlight.js does not have", () => {
    const html = render({ code: "some code", className: "language-not-a-language" });
    expect(html).toContain("some code");
    expect(html).not.toContain("hljs-");
  });

  // The security property of the feature. The highlighted path injects HTML, so a
  // block that could carry markup through would be an XSS vector in every
  // conversation — chat content is written by an LLM and by other members.
  it("escapes markup on the HIGHLIGHTED path", async () => {
    await loadLanguage("javascript");
    const html = render({
      code: 'const x = "<script>alert(1)</script>";',
      className: "language-js",
    });
    expect(html).toContain("hljs-"); // it really did take the injecting path
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes markup on the PLAIN path too", () => {
    // Not highlighted, so React renders it as children — which escapes by
    // construction. Asserted anyway: this is the path a streaming block takes, and
    // it is reached far more often than the other one.
    const html = render({ code: "<img src=x onerror=alert(1)>", className: "language-go" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes markup for an unlabelled block", () => {
    const html = render({ code: "<svg onload=alert(1)>" });
    expect(html).not.toContain("<svg");
  });

  it("keeps the caller's classes so the message styling still applies", () => {
    const html = render({ code: "x", className: "font-mono language-go" });
    expect(html).toContain("font-mono");
    expect(html).toContain("language-go");
  });

  it("renders an empty block without throwing", () => {
    expect(() => render({ code: "", className: "language-go" })).not.toThrow();
  });
});
