# admin-instance-config-editor — Design (webapp)

Reference: `spec.md` in this folder, and the proxy's spec/design for the API.

---

## Files

```
app/api/admin/users/config/route.ts        (new)  BFF GET + PUT
app/admin/instance-config-editor.tsx       (new)  the modal shell, mode switch, save
app/admin/json-tree.tsx                    (new)  the tree renderer (presentation)
app/admin/json-tree.ts                     (new)  PURE tree/text logic (NFR-3)
app/admin/json-tree.test.ts                (new)
app/admin/instance-config-editor.test.tsx  (new)
app/admin/members-panel.tsx                (edit) Instances section
app/admin/restart-policy-select.tsx        (edit) optional `modes` subset
app/admin/restart-notice.tsx               (edit) copy for the `config` reason
lib/admin.ts                               (edit) readInstanceConfig / writeInstanceConfig
lib/i18n/admin.ts                          (edit) `instanceConfig` block, both locales
lib/i18n/parity.test.ts                    (edit) SHARED entries for JSON type names
```

## BFF route

`app/api/admin/users/config/route.ts` mirrors `users/files/route.ts` exactly
(session guard → required-parameter check → `proxyAdminJson`), and opens with the
FR-7 distinction so the sibling file's "Do not add one" instruction is not read
as violated here:

```ts
// One member instance's config.json: read and replace.
//
// This is NOT the private-file content route `users/files/route.ts` forbids, and
// that instruction stands. config.json is proxy-materialized provisioning state
// at the workspace ROOT; FR-7 protects the member-authored uploads the proxy's
// ListUserFiles enumerates, and config.json is not among them. This route takes
// no file name and can address nothing else.
```

`PUT` body is forwarded verbatim (`{raw, revision}`); the policy rides the query
string via `restartParams` + `withRestart`, unvalidated (the proxy owns the
rules — the same reasoning `adminProxy.ts` documents).

## Client calls — `lib/admin.ts`

```ts
export interface InstanceConfig {
  raw: string;
  valid: boolean;
  parseError?: string;
  offset?: number;
  size: number;
  modifiedAt: string;
  revision: string;
  managedPaths: string[];
  redactedPaths?: string[];
}

export interface InstanceConfigWrite extends InstanceConfig {
  reapplied: { ok: boolean; detail?: string };
}

export function readInstanceConfig(
  tenantId: string, subsAccId: string, userAccId: string, agent: string,
): Promise<InstanceConfig>;

export function writeInstanceConfig(
  ref: { tenantId: string; subsAccId: string; userAccId: string; agent: string },
  body: { raw: string; revision: string },
  policy: RestartPolicy,
): Promise<InstanceConfigWrite>;
```

`errorCode(res)` (already used by every call in this module) surfaces
`stale_revision` / `not_provisioned` / `invalid_json` / `too_large` as the thrown
message, which is how the panel branches.

## The pure module — `app/admin/json-tree.ts`

No React import (NFR-3). This is where every rule that can be tested without a
DOM lives.

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

// A parse attempt over the editor's text. `line`/`column` are derived from a
// SyntaxError's position so the raw view can point at the break -- V8 reports a
// byte position, not a line, and an admin cannot use "position 4213".
export interface ParseResult {
  value: JsonValue | null;
  ok: boolean;         // parses AND the top level is an object
  error?: string;
  line?: number;
  column?: number;
}
export function parseDocument(text: string): ParseResult;

export function serialize(value: JsonValue): string;   // JSON.stringify(v, null, 2)

// --- editing primitives: every one takes the WHOLE document and returns a new
// one, so the caller re-serializes once and the text stays the single source of
// truth (spec FR-6.1). No in-place mutation: a shared sub-object would alias.
export function setAtPath(doc: JsonValue, path: Path, value: JsonValue): JsonValue;
export function removeAtPath(doc: JsonValue, path: Path): JsonValue;
export function addKey(doc: JsonValue, path: Path, key: string): JsonValue | DuplicateKey;
export function appendItem(doc: JsonValue, path: Path): JsonValue;

// A path is the segment list, not a dotted string: an object key may contain a
// dot, and re-splitting a joined path would address the wrong node. Dotted form
// exists only for DISPLAY, for `data-path`, and for matching managedPaths.
export type Path = (string | number)[];
export function dotted(path: Path): string;   // ["a","b",0] -> "a.b[0]"

// Whether a path is one the proxy owns. A managed path also protects its
// SUBTREE -- `model_list` is managed, so `model_list[0].provider` is too --
// because the proxy replaces the whole value (spec FR-3.6/FR-5.6).
export function isManaged(path: Path, managed: string[]): boolean;

// The JSON type of a value, and the conversion the type switcher performs.
// string->number keeps the parsed number when the text is numeric and falls back
// to 0; anything->null discards. Recovering a wrongly-typed value
// (`"max_tokens": "32768"`) is a primary repair case (spec FR-5.3).
export type JsonType = "string" | "number" | "boolean" | "null" | "object" | "array";
export function typeOf(v: JsonValue): JsonType;
export function coerce(v: JsonValue, to: JsonType): JsonValue;
```

`isManaged` matching: a `managedPaths` entry from the proxy is dotted with no
indices (`model_list`, `agents.defaults.provider`). The check is "the candidate's
dotted form equals the entry, or starts with the entry followed by `.` or `[`".

## The tree renderer — `app/admin/json-tree.tsx`

One recursive component. Presentation only; every state change goes through the
pure primitives above and up to the editor via `onChange(nextDoc)`.

```tsx
export function JsonTree({ doc, managed, onChange }: {
  doc: JsonValue; managed: string[]; onChange: (next: JsonValue) => void;
});
```

- A node row is: disclosure chevron (containers only) · key/index label ·
  type/child-count badge · value control (leaves) · row actions.
- **Default collapse**: expanded while `path.length < 2`, collapsed below
  (spec FR-5.2). Expansion state is local to the tree, keyed by dotted path, and
  survives an edit (a value change must not re-collapse the branch being worked
  on).
- **Managed rows** render the value as text with a `Lock` icon (lucide, already a
  dependency) and no controls at all. The explanation is one line above the tree,
  not per row — 6 repeated tooltips is noise.
- **Redacted rows** show `***` with the same treatment plus the credential note.
- Every row carries `data-path={dotted(path)}` (spec FR-5.8).
- Styling: `cva` variants for row state (`managed`, `redacted`, `depth`), no
  inline conditional or interpolated `className` — the convention the existing
  `restart-policy-select.tsx` and `components/ui/*` follow.

Leaf controls: `Input` for string/number, a checkbox-styled toggle for boolean,
a static `null` marker, and a small `<select>` type switcher.

## The editor shell — `app/admin/instance-config-editor.tsx`

```tsx
export default function InstanceConfigEditor({ ref, memberLabel, onClose }: {
  ref: { tenantId: string; subsAccId: string; userAccId: string; agent: string };
  memberLabel: string;
  onClose: () => void;
});
```

State — deliberately one text, one revision, one flag:

```ts
const [text, setText]         = useState<string | null>(null);  // canonical (FR-6.1)
const [loaded, setLoaded]     = useState<InstanceConfig | null>(null);
const [mode, setMode]         = useState<"raw" | "tree">("raw");
const [policy, setPolicy]     = useState<RestartPolicy>(DEFAULT_POLICY);
const [saving, setSaving]     = useState(false);
const [notice, setNotice]     = useState<Notice | null>(null); // saved / reverted / reapply-failed / stale
```

- On mount: `readInstanceConfig` → `setText(res.raw)`, and `setMode(res.valid ?
  "tree" : "raw")` (spec FR-3.2).
- `parsed = parseDocument(text)` is recomputed per render — the document is
  ~12 KiB and `JSON.parse` on it is microseconds; memoizing on `text` is the only
  optimization and `useMemo` covers it. The debounce in spec FR-4.2 applies to the
  *status line*, not to the parse.
- **Dirty** = `text !== loaded.raw`. Close/Escape/backdrop while dirty routes
  through `ConfirmDialog` with `tone="danger"` (spec FR-3.4/3.5).
- **Save** is enabled only when `parsed.ok && dirty && !saving`. It calls
  `writeInstanceConfig(ref, {raw: text, revision: loaded.revision}, policy)`.
- On success: `setLoaded(res); setText(res.raw)` (spec FR-6.3). Then compare the
  submitted document's managed paths against the response's; any difference
  becomes the "the proxy re-established these keys" notice, listing them.
  `res.reapplied.ok === false` becomes the warning of spec FR-6.4 — worded as
  *saved, but the model re-apply failed*, never as a failed save.
- On `stale_revision`: the stale notice plus a **Reload** button that re-runs the
  read (spec FR-6.2). No auto-retry — that would overwrite the other writer.
- `RestartPolicySelect` is rendered with `modes={["now", "notice"]}` (below).

Raw mode is a `Textarea` with `font-mono` and a `Tab` key handler inserting two
spaces (spec FR-4.1). The status line shows `parsed.error` with `line:column`.

The modal shell follows `ConfirmDialog`'s idiom — `createPortal` to `document.body`,
`Surface level={1} bordered role="dialog" aria-modal`, backdrop, Escape listener —
at `max-w-4xl` with the body scrolling internally. It is not extracted into
`components/ui/`: one caller, and generalizing a modal on first use is the
abstraction the project's conventions warn against.

## `RestartPolicySelect` — `modes` prop

```tsx
// `modes` narrows the offered set. The instance-config editor passes
// ["now","notice"]: the proxy reduces that endpoint's policy with `bounceNow`,
// where "schedule" behaves as "notice", so offering a scheduler would promise a
// window nothing arms (instance-config FR-7.2).
modes?: readonly RestartMode[];   // default RESTART_MODES
```

Purely additive — existing call sites are unchanged.

## Members panel — the Instances section

`MembersPanel` already holds `users: UserRef[]` (the workspace feed). The
expanded area currently renders `<UserFiles/>`; it gains an `<UserInstances/>`
sibling **above** it, fed the `UserRef[]` filtered to that member's `accId`, so
the `(accId, role)` pairs are exact (spec FR-2.1 — the merged roster's role
labels include invitations with no workspace and lose the pairing).

The existing comment at the top of the file is extended, not weakened:

```tsx
// … There is deliberately NO way to open, download, preview, or edit a user's
// private file here: the privacy invariant (FR-7) holds for every tier, so this
// panel exposes no content affordance. Do not add a link, download icon, or row
// click handler to the file rows.
//
// The Instances section is a DIFFERENT surface and not an exception to that:
// config.json is proxy-materialized provisioning state at the workspace root,
// not member-authored content, and it never appears in the file list above
// (which is the uploads dir). It is reached from an instance row, never from a
// file row — see admin-instance-config-editor's spec.
```

`UserInstances` renders one row per workspace: agent key + an **Edit
configuration** button that sets the panel's `editing` state; the editor is
mounted once at panel level (not per row) so only one can be open.

## i18n

`lib/i18n/admin.ts` gains `instanceConfig: { … }` in both `en` and `pt`:
heading, instance/agent labels, the two mode labels, `managedNote`,
`redactedNote`, `invalidJson`, `atLine`, `format`, `addKey`, `duplicateKey`,
`removeKey`, `appendItem`, `removeItem`, `typeLabel`, `saved`,
`managedReverted`, `reapplyFailed`, `staleRevision`, `reload`,
`notProvisioned`, `discardTitle`, `discardMessage`.

`restart-notice.tsx`'s reason map gains `config` in both locales (spec FR-7.3).

`parity.test.ts`'s `SHARED` set gains the four type names
(`admin.instanceConfig.types.string` …) — JSON type identifiers, verbatim in
both locales for the same reason secret formats already are.

## Test plan

`app/admin/json-tree.test.ts` (vitest, no DOM):

| Test | Spec |
| --- | --- |
| parse errors → line/column; top-level array → `ok:false` | FR-4.2/4.3 |
| `typeOf` for each JSON type | FR-5.1 |
| `coerce` string→number (numeric and non-numeric), →boolean, →null | FR-5.3 |
| `setAtPath` / `removeAtPath` do not mutate the input | FR-6.1 |
| `addKey` refuses a duplicate | FR-5.5 |
| `appendItem` on an array; `removeAtPath` on an index shifts the rest | FR-5.4 |
| `isManaged` matches the entry, its subtree, and rejects a prefix-lookalike (`model_lists`) | FR-5.6 |
| edit → serialize → parse round-trips | FR-5.7 |

`app/admin/instance-config-editor.test.tsx` (jsdom, fetch stubbed — the pattern
`restart-notice.test.tsx` uses): opens on raw when invalid, tree disabled while
invalid, save gating, 409 → stale + Reload, response replaces state, managed
revert announced, `reapplied.ok:false` warns, policy value reaches the request,
dirty close confirms.

Gate: `yarn tsc --noEmit && yarn vitest run` (plus `yarn lint` if configured).
