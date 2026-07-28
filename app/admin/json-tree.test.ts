import { describe, it, expect } from "vitest";
import {
  parseDocument,
  serialize,
  dotted,
  typeOf,
  coerce,
  isWithin,
  parseNumberDraft,
  setAtPath,
  removeAtPath,
  addKey,
  appendItem,
  valueAtPath,
  managedDifferences,
  DUPLICATE_KEY,
  type JsonValue,
} from "./json-tree";

describe("parseDocument", () => {
  it("reports line and column, not only the parser's character offset", () => {
    const res = parseDocument('{\n  "a": 1,\n  "b" 2\n}');
    expect(res.ok).toBe(false);
    // An admin cannot act on "position 19"; the line is what the raw view marks.
    expect(res.line).toBe(3);
    expect(res.column).toBeGreaterThan(1);
  });

  it("still reports the message when the engine gives no position", () => {
    // V8 summarizes an unexpected token in a longer document as a snippet with
    // no position, and Safari/Firefox phrase these differently again. A missing
    // line must degrade to "message only", never to a wrong line.
    const res = parseDocument('{\n  "a": 1,\n  "bbbbbbbbbbbbbbbbbbbbbbbbbbbb": oops\n}');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("rejects a top-level array and null: the proxy requires an object", () => {
    expect(parseDocument("[]").ok).toBe(false);
    expect(parseDocument("null").ok).toBe(false);
    expect(parseDocument("42").ok).toBe(false);
    expect(parseDocument('{"a":1}').ok).toBe(true);
  });

  it("survives a truncated document without throwing", () => {
    const res = parseDocument('{"version": 3, "agents": {');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe("dotted", () => {
  it("renders indices as brackets so an array element is unambiguous", () => {
    expect(dotted(["agents", "defaults", "provider"])).toBe("agents.defaults.provider");
    expect(dotted(["model_list", 0, "api_keys"])).toBe("model_list[0].api_keys");
    expect(dotted([])).toBe("");
  });
});

describe("typeOf", () => {
  it("names every JSON type", () => {
    expect(typeOf(null)).toBe("null");
    expect(typeOf(true)).toBe("boolean");
    expect(typeOf(3)).toBe("number");
    expect(typeOf("s")).toBe("string");
    expect(typeOf([])).toBe("array");
    expect(typeOf({})).toBe("object");
  });
});

describe("coerce", () => {
  it("recovers a number stored as a string — the repair this exists for", () => {
    expect(coerce("32768", "number")).toBe(32768);
  });

  it("turns a non-numeric string into 0, never NaN", () => {
    // NaN does not survive JSON.stringify and would silently become null.
    expect(coerce("not a number", "number")).toBe(0);
  });

  it("converts to boolean from both the literal and its string form", () => {
    expect(coerce("true", "boolean")).toBe(true);
    expect(coerce("anything else", "boolean")).toBe(false);
    expect(coerce(1, "boolean")).toBe(true);
  });

  it("stringifies scalars and empties containers", () => {
    expect(coerce(60, "string")).toBe("60");
    expect(coerce(null, "string")).toBe("");
    expect(coerce("x", "null")).toBe(null);
    expect(coerce("x", "object")).toEqual({});
    expect(coerce("x", "array")).toEqual([]);
  });
});

describe("parseNumberDraft", () => {
  // The states you type THROUGH on the way to a decimal. Committing these would
  // coerce to 0 and erase the keystroke, which made 0.7 unreachable in the tree —
  // and the seeded template has min_success_ratio: 0.7.
  it("holds back an incomplete number instead of coercing it to 0", () => {
    expect(parseNumberDraft("0.")).toBeNull();
    expect(parseNumberDraft("-")).toBeNull();
    expect(parseNumberDraft("")).toBeNull();
    expect(parseNumberDraft(".")).toBeNull();
    expect(parseNumberDraft("1e")).toBeNull();
  });

  it("commits a complete number, including decimals, negatives and exponents", () => {
    expect(parseNumberDraft("0")).toBe(0);
    expect(parseNumberDraft("0.7")).toBe(0.7);
    expect(parseNumberDraft("-1")).toBe(-1);
    expect(parseNumberDraft("-0.25")).toBe(-0.25);
    expect(parseNumberDraft("32768")).toBe(32768);
    expect(parseNumberDraft("1e3")).toBe(1000);
  });

  it("rejects text that is not a number at all", () => {
    expect(parseNumberDraft("abc")).toBeNull();
    expect(parseNumberDraft("0x10")).toBeNull();
    expect(parseNumberDraft("Infinity")).toBeNull();
  });

  it("walks a full decimal entry: only the complete states reach the document", () => {
    const typed = ["", "0", "0.", "0.7"];
    expect(typed.map(parseNumberDraft)).toEqual([null, 0, null, 0.7]);
  });
});

describe("isWithin", () => {
  const managed = ["model_list", "agents.defaults.provider", "channel_list.pico.enabled"];

  it("matches the entry itself and its whole subtree", () => {
    expect(isWithin(["model_list"], managed)).toBe(true);
    expect(isWithin(["model_list", 0], managed)).toBe(true);
    expect(isWithin(["model_list", 0, "provider"], managed)).toBe(true);
    expect(isWithin(["agents", "defaults", "provider"], managed)).toBe(true);
  });

  it("does not match a prefix lookalike", () => {
    expect(isWithin(["model_lists"], managed)).toBe(false);
    expect(isWithin(["agents", "defaults", "provider_extra"], managed)).toBe(false);
  });

  it("leaves siblings editable", () => {
    expect(isWithin(["agents", "defaults", "max_tokens"], managed)).toBe(false);
    expect(isWithin(["channel_list", "pico", "settings"], managed)).toBe(false);
  });
});

describe("editing primitives", () => {
  const doc: JsonValue = {
    agents: { defaults: { max_tokens: 32768, provider: "openai" } },
    model_list: [{ model_name: "main" }, { model_name: "backup" }],
  };

  it("setAtPath does not mutate its input", () => {
    const next = setAtPath(doc, ["agents", "defaults", "max_tokens"], 8192);
    expect(valueAtPath(next, "agents.defaults.max_tokens")).toBe(8192);
    expect(valueAtPath(doc, "agents.defaults.max_tokens")).toBe(32768);
  });

  it("setAtPath reaches into an array by index", () => {
    const next = setAtPath(doc, ["model_list", 1, "model_name"], "renamed");
    expect((next as { model_list: { model_name: string }[] }).model_list[1].model_name).toBe(
      "renamed",
    );
  });

  it("removeAtPath drops an object key without mutating the input", () => {
    const next = removeAtPath(doc, ["agents", "defaults", "provider"]);
    expect(valueAtPath(next, "agents.defaults.provider")).toBeUndefined();
    expect(valueAtPath(doc, "agents.defaults.provider")).toBe("openai");
  });

  it("removeAtPath splices an array element rather than leaving a hole", () => {
    const next = removeAtPath(doc, ["model_list", 0]) as { model_list: unknown[] };
    // `delete arr[i]` would leave a hole that serializes to null and read as a
    // deliberate value.
    expect(next.model_list).toHaveLength(1);
    expect(serialize(next as JsonValue)).not.toContain("null");
  });

  it("addKey inserts an empty string the admin then retypes", () => {
    const next = addKey(doc, ["agents", "defaults"], "steering_mode");
    expect(valueAtPath(next as JsonValue, "agents.defaults.steering_mode")).toBe("");
  });

  it("addKey refuses a duplicate instead of overwriting a sibling", () => {
    expect(addKey(doc, ["agents", "defaults"], "provider")).toBe(DUPLICATE_KEY);
  });

  it("appendItem extends an array", () => {
    const next = appendItem(doc, ["model_list"]) as { model_list: unknown[] };
    expect(next.model_list).toHaveLength(3);
  });

  it("round-trips an edit through the text and back", () => {
    const edited = setAtPath(doc, ["agents", "defaults", "max_tokens"], 4096);
    const reparsed = parseDocument(serialize(edited));
    expect(reparsed.ok).toBe(true);
    expect(valueAtPath(reparsed.value as JsonValue, "agents.defaults.max_tokens")).toBe(4096);
  });
});

describe("managedDifferences", () => {
  const managed = ["agents.defaults.model_name", "model_list"];

  it("names the managed paths the proxy re-established", () => {
    const submitted = { agents: { defaults: { model_name: "hand-edited" } } } as JsonValue;
    const saved = { agents: { defaults: { model_name: "registry-owned" } } } as JsonValue;
    expect(managedDifferences(submitted, saved, managed)).toEqual(["agents.defaults.model_name"]);
  });

  it("reports nothing when the save landed as sent", () => {
    const doc = { agents: { defaults: { model_name: "main" } }, model_list: [] } as JsonValue;
    expect(managedDifferences(doc, doc, managed)).toEqual([]);
  });
});
