import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { TenantAvatar } from "./avatar";

describe("TenantAvatar", () => {
  it("renders the logo as an img when a logo is provided", () => {
    const html = renderToStaticMarkup(
      <TenantAvatar name="Acme Corp" logo="data:image/webp;base64,AAAA" />,
    );
    expect(html).toContain('src="data:image/webp;base64,AAAA"');
    expect(html).toContain("object-contain");
    expect(html).toContain('alt="Acme Corp logo"');
  });

  it("falls back to initials from the first two words", () => {
    const html = renderToStaticMarkup(<TenantAvatar name="Acme Corp" />);
    expect(html).toContain(">AC<");
    expect(html).not.toContain("<img");
  });

  it("uses the first two letters for a single-word name", () => {
    const html = renderToStaticMarkup(<TenantAvatar name="Biotrop" />);
    expect(html).toContain(">BI<");
  });

  it("uses a valid brand primaryColor as the initials background", () => {
    const html = renderToStaticMarkup(<TenantAvatar name="Acme" color="#123456" />);
    expect(html).toContain("background-color:#123456");
  });

  it("ignores an invalid color and derives a deterministic one", () => {
    const html = renderToStaticMarkup(<TenantAvatar name="Acme" color="not-a-color" />);
    expect(html).toContain("background-color:hsl(");
  });
});
