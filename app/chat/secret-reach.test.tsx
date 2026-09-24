import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import SecretFormatGroup from "./secret-format-group";
import { formatReaches, SECRET_FORMATS, type SecretFormat } from "@/lib/secrets";
import { chatCopy } from "@/lib/i18n/chat";

// TWO THINGS A MEMBER COULD NOT SEE, AND ONE OF THEM COST THEM A CREDENTIAL.
//
// The tab offers four sinks as though they were four equivalent choices. They are
// not: `file` has never reached any harness, and `native` is picoclaw's own slot
// file, which a ganglion agent never reads. A member picked one, saved, got a 200,
// and their agent could not see it — with nothing anywhere saying so.
//
// The second is the cascade. `dotenv`/`json` are "user wins", and `userWins` is
// computed ACROSS the pair — a member holding FOO in `.env` drops an admin's FOO
// from `secrets.json` too. So an admin injected a credential for the whole scope,
// got a 200, and for that member it was silently ignored.

const t = chatCopy.en;

describe("which formats the harness actually delivers", () => {
  it("delivers the two conventional sinks under the ganglion, and nothing else", () => {
    expect(formatReaches("dotenv", "ganglion")).toBe(true);
    expect(formatReaches("json", "ganglion")).toBe(true);
    // Picoclaw's own slot file. A ganglion reads `web.*` into its own search
    // provider and the agent never sees any of it.
    expect(formatReaches("native", "ganglion")).toBe(false);
  });

  // IT NEVER REACHED ANY HARNESS. Accepted, stored and listed; the store dir is
  // simply never mounted. Not a ganglion regression — a dead end under both.
  it("never delivers the file format, under any harness", () => {
    for (const harness of ["ganglion", "picoclaw"]) {
      expect(formatReaches("file", harness), `file claimed to reach ${harness}`).toBe(false);
    }
  });

  it("delivers the three sink files under picoclaw, which mounts them", () => {
    for (const f of ["dotenv", "json", "native"] as SecretFormat[]) {
      expect(formatReaches(f, "picoclaw"), `${f} should reach picoclaw`).toBe(true);
    }
  });

  // A PROXY THAT PREDATES THE FIELD CLAIMS NOTHING. Telling a member "your agent
  // cannot see this" when it can is worse than saying nothing: they would delete a
  // working credential and save it somewhere else for no reason.
  it("claims nothing when the harness is unknown", () => {
    for (const f of SECRET_FORMATS) {
      expect(formatReaches(f, null), `${f} was judged without knowing the harness`).toBe(true);
    }
  });
});

function group(over: Partial<Parameters<typeof SecretFormatGroup>[0]> = {}) {
  return renderToStaticMarkup(
    <SecretFormatGroup
      format="dotenv"
      title="Dotenv"
      hint="hint"
      names={["OPENAI_API_KEY", "MINE"]}
      writable
      busy={null}
      onSave={async () => true}
      onDelete={async () => {}}
      {...over}
    />,
  );
}

describe("what the group says about itself", () => {
  // MATCHED ON A FRAGMENT WITHOUT THE APOSTROPHE: `renderToStaticMarkup` escapes
  // it, so the copy as written never appears verbatim in the markup.
  const warning = t.secrets.notDelivered.split("runtime")[1].slice(0, 40);

  it("warns when this harness will not deliver the sink", () => {
    expect(warning.length, "the copy changed shape; this fragment proves nothing").toBeGreaterThan(20);
    expect(group({ unreachable: true })).toContain(warning);
  });

  it("says nothing when it will", () => {
    expect(group()).not.toContain(warning);
  });

  // THE MARK SITS ON THE ROW THAT CAUSES IT, beside the delete control, because
  // deleting that one entry is exactly what lets the admin's value through. A
  // summary somewhere else would name the problem without reaching the fix.
  it("marks the name whose value is beating an admin's", () => {
    const html = group({ shadowing: ["OPENAI_API_KEY"] });
    expect(html).toContain(t.secrets.shadowsSharedShort);
    expect(html).toContain(t.secrets.shadowsShared);
  });

  it("marks only the colliding name, not every name in the group", () => {
    const html = group({ shadowing: ["OPENAI_API_KEY"] });
    expect(html.split(t.secrets.shadowsSharedShort).length - 1).toBe(1);
  });

  it("marks nothing when the member collides with no one", () => {
    expect(group({ shadowing: [] })).not.toContain(t.secrets.shadowsSharedShort);
    expect(group()).not.toContain(t.secrets.shadowsSharedShort);
  });
});
