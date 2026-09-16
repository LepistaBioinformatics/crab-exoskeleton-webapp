import { describe, it, expect } from "vitest";
import { records, total, truncated } from "./rpcRecords";

// Three shapes reach every list route, decided by the repository rather than by
// the method that was called, so each one gets a case here.
describe("records", () => {
  it("passes a bare array through", () => {
    expect(records<number>([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("unwraps a paginated envelope", () => {
    expect(records<number>({ count: 9, skip: 0, size: 3, records: [1, 2, 3] })).toEqual([
      1, 2, 3,
    ]);
  });

  // The one that used to read as a failure. `FetchManyResponseKind::NotFound`
  // serializes as a null RESULT, so an empty tenant list arrives here as null and
  // has to render the empty state, not an alert.
  it("treats null as an empty collection, not an error", () => {
    expect(records<number>(null)).toEqual([]);
  });

  it("gives up quietly on anything else", () => {
    expect(records<number>(undefined)).toEqual([]);
    expect(records<number>({ records: "not an array" })).toEqual([]);
    expect(records<number>(42)).toEqual([]);
  });
});

describe("total", () => {
  it("reads the envelope's own count", () => {
    expect(total({ count: 9, records: [] })).toBe(9);
  });

  // A bare array says nothing about a total. Returning its length would invent a
  // claim the server never made -- the difference between "this page is empty"
  // and "this collection is empty".
  it("is null for a payload that makes no claim", () => {
    expect(total([1, 2, 3])).toBeNull();
    expect(total(null)).toBeNull();
    expect(total({ count: "9" })).toBeNull();
  });
});

describe("truncated", () => {
  it("is true when the server counts more than it returned", () => {
    expect(truncated({ count: 40, records: [] }, 10)).toBe(true);
  });

  it("is false when the page is the whole collection", () => {
    expect(truncated({ count: 3, records: [] }, 3)).toBe(false);
  });

  // No count means no claim, and a claim is what truncation needs. Guessing
  // "true" here would put a partial-list warning on every complete list.
  it("is false when there is no count to compare", () => {
    expect(truncated([1, 2, 3], 3)).toBe(false);
    expect(truncated(null, 0)).toBe(false);
  });
});
