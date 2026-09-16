// Unwrapping a mycelium list result, which arrives in three shapes.
//
// `FetchManyResponseKind` serializes as a bare array when the repository did not
// paginate, as `{count, skip, size, records}` when it did, and as **`null`** when
// nothing matched (rpc/response_kind.rs). That last one is the trap: `null` is a
// RESULT meaning "no rows", not an error and not a transport failure. Reading it
// as a failure turns an empty tenant list into an alert.
//
// React-free and separately tested, because every list route below depends on it
// and the shape is decided by the repository rather than by the method.

export function records<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const inner = (result as { records?: unknown })?.records;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

// The envelope's own count, or null when the payload makes no claim about a
// total. A bare array carries no count -- returning its length instead would
// invent a "this is everything" the server never said, which is the difference
// between an empty page and an empty collection.
export function total(result: unknown): number | null {
  const count = (result as { count?: unknown })?.count;
  return typeof count === "number" ? count : null;
}

// Whether the server says there is more than came back. Used to tell a member
// "this list is partial" rather than letting a page read as the whole truth --
// the same reason app/api/invitations/route.ts reports truncation.
export function truncated(result: unknown, returned: number): boolean {
  const count = total(result);
  return count !== null && count > returned;
}
